import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const TERMINAL = new Set(["RECEIVED", "PICKED_UP"]);

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = (session.user as any).tenantId;

  const org = await prisma.organization.findFirst({
    where: { id: params.id, tenantId },
    include: {
      budgets: { orderBy: [{ fiscalYear: "desc" }, { name: "asc" }] },
      _count: { select: { members: true, requests: true } },
    },
  });

  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Compute spent/reserved from actual requests (not stored Budget.spent which is stale)
  const requests = await prisma.purchaseRequest.findMany({
    where: { organizationId: params.id, status: { not: "CANCELLED" } },
    select: { budgetId: true, status: true, totalActual: true, totalEstimated: true },
  });

  const spentByBudget: Record<string, number> = {};
  const reservedByBudget: Record<string, number> = {};
  let unlinkedSpent = 0;
  let unlinkedReserved = 0;

  for (const r of requests) {
    const amt = (r.totalActual ?? 0) || (r.totalEstimated ?? 0);
    if (!amt) continue;
    const terminal = TERMINAL.has(r.status);
    if (r.budgetId) {
      if (terminal) spentByBudget[r.budgetId] = (spentByBudget[r.budgetId] ?? 0) + amt;
      else          reservedByBudget[r.budgetId] = (reservedByBudget[r.budgetId] ?? 0) + amt;
    } else {
      if (terminal) unlinkedSpent += amt;
      else          unlinkedReserved += amt;
    }
  }

  const singleBudget = org.budgets.length === 1 ? org.budgets[0] : null;

  const budgets = org.budgets.map((b) => {
    let spent = spentByBudget[b.id] ?? 0;
    let reserved = reservedByBudget[b.id] ?? 0;
    if (singleBudget?.id === b.id) {
      spent += unlinkedSpent;
      reserved += unlinkedReserved;
    }
    return { ...b, spent, reserved };
  });

  return NextResponse.json({
    org: { ...org, budgets },
    unlinkedSpent: singleBudget ? 0 : unlinkedSpent,
    unlinkedReserved: singleBudget ? 0 : unlinkedReserved,
  });
}
