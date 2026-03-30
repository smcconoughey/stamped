import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const TERMINAL = new Set(["RECEIVED", "PICKED_UP"]);

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as any;
  const isAdminOrLead = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN", "ORG_LEAD"].includes(user.role);
  if (!isAdminOrLead) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const fiscalYear = searchParams.get("fy") ?? null;

  const orgWhere: any = { tenantId: user.tenantId, active: true };

  // ORG_LEAD: only their orgs
  if (user.role === "ORG_LEAD") {
    const memberships = await prisma.organizationMember.findMany({
      where: { userId: user.id, memberRole: "LEAD" },
      select: { organizationId: true },
    });
    orgWhere.id = { in: memberships.map((m: any) => m.organizationId) };
  }

  const orgs = await prisma.organization.findMany({
    where: orgWhere,
    include: {
      budgets: {
        where: fiscalYear ? { fiscalYear } : undefined,
        orderBy: [{ fiscalYear: "desc" }, { name: "asc" }],
      },
    },
    orderBy: { name: "asc" },
  });

  // Use DB-level aggregation instead of loading all requests into memory
  const orgIds = orgs.map((o) => o.id);
  const terminalStatuses = ["RECEIVED", "PICKED_UP"];

  const [spentAgg, reservedAgg] = await Promise.all([
    prisma.purchaseRequest.groupBy({
      by: ["organizationId", "budgetId"],
      where: { organizationId: { in: orgIds }, status: { in: terminalStatuses } },
      _sum: { totalActual: true, totalEstimated: true },
    }),
    prisma.purchaseRequest.groupBy({
      by: ["organizationId", "budgetId"],
      where: { organizationId: { in: orgIds }, status: { notIn: [...terminalStatuses, "CANCELLED"] } },
      _sum: { totalActual: true, totalEstimated: true },
    }),
  ]);

  // Build per-budget spending maps
  const spentByBudget: Record<string, number> = {};
  const reservedByBudget: Record<string, number> = {};
  const unlinkedSpentByOrg: Record<string, number> = {};
  const unlinkedReservedByOrg: Record<string, number> = {};

  for (const row of spentAgg) {
    const amt = (row._sum.totalActual ?? 0) || (row._sum.totalEstimated ?? 0);
    if (row.budgetId) spentByBudget[row.budgetId] = (spentByBudget[row.budgetId] ?? 0) + amt;
    else unlinkedSpentByOrg[row.organizationId] = (unlinkedSpentByOrg[row.organizationId] ?? 0) + amt;
  }
  for (const row of reservedAgg) {
    const amt = (row._sum.totalActual ?? 0) || (row._sum.totalEstimated ?? 0);
    if (row.budgetId) reservedByBudget[row.budgetId] = (reservedByBudget[row.budgetId] ?? 0) + amt;
    else unlinkedReservedByOrg[row.organizationId] = (unlinkedReservedByOrg[row.organizationId] ?? 0) + amt;
  }

  // Collect all distinct fiscal years across all orgs (for FY selector)
  const allFiscalYears = Array.from(
    new Set(orgs.flatMap((o) => o.budgets.map((b) => b.fiscalYear))).values()
  ).sort().reverse();

  const result = orgs.map((org) => {
    const budgets = org.budgets;
    const singleBudget = budgets.length === 1 ? budgets[0] : null;

    return {
      id: org.id,
      name: org.name,
      code: org.code,
      costCenter: org.costCenter,
      department: org.department,
      budgets: budgets.map((b) => {
        let spent = spentByBudget[b.id] ?? 0;
        let reserved = reservedByBudget[b.id] ?? 0;

        // If this is the only budget for the org, absorb all unlinked request amounts
        if (singleBudget?.id === b.id) {
          spent += unlinkedSpentByOrg[org.id] ?? 0;
          reserved += unlinkedReservedByOrg[org.id] ?? 0;
        }

        return { id: b.id, name: b.name, fiscalYear: b.fiscalYear, allocated: b.allocated, spent, reserved, costCenter: b.costCenter, projectNumber: b.projectNumber, notes: b.notes };
      }),
      // Unlinked amounts that couldn't be attributed (only when multiple budgets exist)
      unlinkedSpent: budgets.length !== 1 ? (unlinkedSpentByOrg[org.id] ?? 0) : 0,
      unlinkedReserved: budgets.length !== 1 ? (unlinkedReservedByOrg[org.id] ?? 0) : 0,
    };
  });

  return NextResponse.json({ orgs: result, fiscalYears: allFiscalYears });
}
