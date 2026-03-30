import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const TERMINAL = new Set(["RECEIVED", "PICKED_UP"]);

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as any;
  const { searchParams } = new URL(req.url);
  const fy = searchParams.get("fy"); // e.g. "FY2026" — optional filter

  const [orgs, settings] = await Promise.all([
    prisma.organization.findMany({
      where: { tenantId: user.tenantId, active: true },
      include: {
        budgets: {
          where: fy ? { fiscalYear: fy } : undefined,
          orderBy: [{ fiscalYear: "desc" }, { name: "asc" }],
        },
        _count: { select: { members: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.tenantSettings.findUnique({ where: { tenantId: user.tenantId } }),
  ]);

  // All fiscal years that exist across all budgets (for FY selector)
  const allBudgets = await prisma.budget.findMany({
    where: { organization: { tenantId: user.tenantId } },
    select: { fiscalYear: true },
    distinct: ["fiscalYear"],
    orderBy: { fiscalYear: "desc" },
  });
  const fiscalYears = allBudgets.map(b => b.fiscalYear);

  const orgIds = orgs.map(o => o.id);

  // Use groupBy aggregation instead of loading all requests into memory
  const terminalStatuses = ["RECEIVED", "PICKED_UP"];
  const [spentAgg, reservedAgg, requestCounts] = await Promise.all([
    // Spent: terminal status requests grouped by org + budget
    prisma.purchaseRequest.groupBy({
      by: ["organizationId", "budgetId"],
      where: { organizationId: { in: orgIds }, status: { in: terminalStatuses } },
      _sum: { totalActual: true, totalEstimated: true },
    }),
    // Reserved: non-terminal, non-cancelled requests grouped by org + budget
    prisma.purchaseRequest.groupBy({
      by: ["organizationId", "budgetId"],
      where: { organizationId: { in: orgIds }, status: { notIn: [...terminalStatuses, "CANCELLED"] } },
      _sum: { totalActual: true, totalEstimated: true },
    }),
    // Count active requests per org
    prisma.purchaseRequest.groupBy({
      by: ["organizationId"],
      where: { organizationId: { in: orgIds }, status: { not: "CANCELLED" } },
      _count: { id: true },
    }),
  ]);
  const reqCountMap = new Map(requestCounts.map(r => [r.organizationId, r._count.id]));

  // Build lookup: orgId -> budgetId -> { spent, reserved }
  const aggMap = new Map<string, Map<string | null, { spent: number; reserved: number }>>();
  for (const row of spentAgg) {
    const key = row.budgetId ?? null;
    if (!aggMap.has(row.organizationId)) aggMap.set(row.organizationId, new Map());
    const budgetMap = aggMap.get(row.organizationId)!;
    const existing = budgetMap.get(key) ?? { spent: 0, reserved: 0 };
    existing.spent += (row._sum.totalActual ?? 0) || (row._sum.totalEstimated ?? 0);
    budgetMap.set(key, existing);
  }
  for (const row of reservedAgg) {
    const key = row.budgetId ?? null;
    if (!aggMap.has(row.organizationId)) aggMap.set(row.organizationId, new Map());
    const budgetMap = aggMap.get(row.organizationId)!;
    const existing = budgetMap.get(key) ?? { spent: 0, reserved: 0 };
    existing.reserved += (row._sum.totalActual ?? 0) || (row._sum.totalEstimated ?? 0);
    budgetMap.set(key, existing);
  }

  const enriched = orgs.map(org => {
    const budgetMap = aggMap.get(org.id) ?? new Map();
    const singleBudget = org.budgets.length === 1 ? org.budgets[0] : null;
    const unlinked = budgetMap.get(null) ?? { spent: 0, reserved: 0 };

    let totalAllocated = 0;
    let totalSpent = 0;
    let totalReserved = 0;

    const budgets = org.budgets.map(b => {
      const agg = budgetMap.get(b.id) ?? { spent: 0, reserved: 0 };
      let spent = agg.spent;
      let reserved = agg.reserved;
      if (singleBudget?.id === b.id) {
        spent += unlinked.spent;
        reserved += unlinked.reserved;
      }
      totalAllocated += b.allocated;
      totalSpent += spent;
      totalReserved += reserved;
      return { ...b, spent, reserved };
    });

    if (org.budgets.length === 0) {
      totalSpent += unlinked.spent;
      totalReserved += unlinked.reserved;
    }

    return {
      id: org.id, name: org.name, code: org.code,
      department: org.department, costCenter: org.costCenter,
      budgetCount: org.budgets.length,
      memberCount: org._count.members,
      requestCount: reqCountMap.get(org.id) ?? 0,
      totalAllocated,
      totalSpent,
      totalReserved,
      totalAvailable: totalAllocated - totalSpent - totalReserved,
      budgets,
    };
  });

  return NextResponse.json({
    organizations: enriched,
    fiscalYears,
    settings: {
      currentFiscalYear: settings?.currentFiscalYear ?? fiscalYears[0] ?? null,
      fyEndDate: settings?.fyEndDate ?? null,
    },
  });
}

// PATCH — update tenant settings (super admin only)
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;
  if (user.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { currentFiscalYear, fyEndDate } = await req.json();
  const settings = await prisma.tenantSettings.upsert({
    where: { tenantId: user.tenantId },
    update: {
      ...(currentFiscalYear !== undefined ? { currentFiscalYear } : {}),
      ...(fyEndDate !== undefined ? { fyEndDate } : {}),
    },
    create: { tenantId: user.tenantId, currentFiscalYear, fyEndDate },
  });
  return NextResponse.json({ settings });
}
