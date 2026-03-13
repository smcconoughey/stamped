import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as any;
  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user.role);
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const orgs = await prisma.organization.findMany({
    where: { tenantId: user.tenantId, active: true },
    include: {
      budgets: { orderBy: [{ fiscalYear: "desc" }, { name: "asc" }] },
      _count: { select: { requests: true } },
    },
    orderBy: { name: "asc" },
  });

  // For each budget, compute spent = sum of totalActual (or totalEstimated) for non-cancelled requests linked to it
  const budgetIds = orgs.flatMap((o) => o.budgets.map((b) => b.id));

  const spentByBudget: Record<string, number> = {};
  const reservedByBudget: Record<string, number> = {};

  if (budgetIds.length) {
    const linked = await prisma.purchaseRequest.groupBy({
      by: ["budgetId", "status"],
      where: {
        budgetId: { in: budgetIds },
        status: { not: "CANCELLED" },
      },
      _sum: { totalActual: true, totalEstimated: true },
    });

    for (const row of linked) {
      if (!row.budgetId) continue;
      const amt = (row._sum.totalActual ?? 0) || (row._sum.totalEstimated ?? 0);
      const terminal = ["RECEIVED", "PICKED_UP"].includes(row.status);
      if (terminal) {
        spentByBudget[row.budgetId] = (spentByBudget[row.budgetId] ?? 0) + amt;
      } else {
        reservedByBudget[row.budgetId] = (reservedByBudget[row.budgetId] ?? 0) + amt;
      }
    }
  }

  const result = orgs.map((org) => ({
    id: org.id,
    name: org.name,
    code: org.code,
    costCenter: org.costCenter,
    department: org.department,
    budgets: org.budgets.map((b) => ({
      id: b.id,
      name: b.name,
      fiscalYear: b.fiscalYear,
      allocated: b.allocated,
      spent: spentByBudget[b.id] ?? 0,
      reserved: reservedByBudget[b.id] ?? 0,
      notes: b.notes,
    })),
  }));

  return NextResponse.json({ orgs: result });
}
