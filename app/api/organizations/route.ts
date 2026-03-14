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

  // For each org, compute real spent/reserved from requests
  const orgIds = orgs.map(o => o.id);
  const requests = await prisma.purchaseRequest.findMany({
    where: { organizationId: { in: orgIds }, status: { not: "CANCELLED" } },
    select: { organizationId: true, budgetId: true, status: true, totalActual: true, totalEstimated: true },
  });

  // Also count active requests per org
  const requestCounts = await prisma.purchaseRequest.groupBy({
    by: ["organizationId"],
    where: { organizationId: { in: orgIds }, status: { not: "CANCELLED" } },
    _count: { id: true },
  });
  const reqCountMap = new Map(requestCounts.map(r => [r.organizationId, r._count.id]));

  const enriched = orgs.map(org => {
    const orgRequests = requests.filter(r => r.organizationId === org.id);
    const singleBudget = org.budgets.length === 1 ? org.budgets[0] : null;

    let totalAllocated = 0;
    let totalSpent = 0;
    let totalReserved = 0;
    let unlinkedSpent = 0;
    let unlinkedReserved = 0;

    for (const r of orgRequests) {
      const amt = (r.totalActual ?? 0) || (r.totalEstimated ?? 0);
      if (!amt) continue;
      const terminal = TERMINAL.has(r.status);
      if (r.budgetId) {
        if (terminal) {
          // will be added per-budget below
        }
      } else {
        if (terminal) unlinkedSpent += amt;
        else unlinkedReserved += amt;
      }
    }

    // Per-budget aggregation
    const spentByBudget: Record<string, number> = {};
    const reservedByBudget: Record<string, number> = {};
    for (const r of orgRequests) {
      if (!r.budgetId) continue;
      const amt = (r.totalActual ?? 0) || (r.totalEstimated ?? 0);
      if (!amt) continue;
      const terminal = TERMINAL.has(r.status);
      if (terminal) spentByBudget[r.budgetId] = (spentByBudget[r.budgetId] ?? 0) + amt;
      else reservedByBudget[r.budgetId] = (reservedByBudget[r.budgetId] ?? 0) + amt;
    }

    const budgets = org.budgets.map(b => {
      let spent = spentByBudget[b.id] ?? 0;
      let reserved = reservedByBudget[b.id] ?? 0;
      if (singleBudget?.id === b.id) {
        spent += unlinkedSpent;
        reserved += unlinkedReserved;
      }
      totalAllocated += b.allocated;
      totalSpent += spent;
      totalReserved += reserved;
      return { ...b, spent, reserved };
    });

    // If no budgets in this FY but there are unlinked requests, still surface them
    if (org.budgets.length === 0) {
      totalSpent += unlinkedSpent;
      totalReserved += unlinkedReserved;
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
