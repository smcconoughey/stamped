import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function isAdminOrLead(role: string) {
  return ["ORG_LEAD", "ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(role);
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as any;
  if (!isAdminOrLead(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const org = await prisma.organization.findFirst({ where: { id: params.id, tenantId: user.tenantId } });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name, fiscalYear, allocated, costCenter, projectNumber, notes } = await req.json();
  if (!name || !fiscalYear || allocated == null) {
    return NextResponse.json({ error: "name, fiscalYear, and allocated are required" }, { status: 400 });
  }

  const budget = await prisma.budget.upsert({
    where: { organizationId_fiscalYear_name: { organizationId: params.id, fiscalYear, name } },
    create: { organizationId: params.id, name, fiscalYear, allocated: parseFloat(allocated), costCenter: costCenter || null, projectNumber: projectNumber || null, notes: notes || null },
    update: { allocated: parseFloat(allocated), costCenter: costCenter || null, projectNumber: projectNumber || null, notes: notes || null },
  });

  return NextResponse.json({ budget });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as any;
  if (!isAdminOrLead(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const org = await prisma.organization.findFirst({ where: { id: params.id, tenantId: user.tenantId } });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { budgetId, name, fiscalYear, allocated, costCenter, projectNumber, notes } = await req.json();
  if (!budgetId) return NextResponse.json({ error: "budgetId required" }, { status: 400 });

  const update: any = {};
  if (name !== undefined) update.name = name;
  if (fiscalYear !== undefined) update.fiscalYear = fiscalYear;
  if (allocated !== undefined) update.allocated = parseFloat(allocated);
  if (costCenter !== undefined) update.costCenter = costCenter || null;
  if (projectNumber !== undefined) update.projectNumber = projectNumber || null;
  if (notes !== undefined) update.notes = notes || null;

  const budget = await prisma.budget.update({ where: { id: budgetId }, data: update });
  return NextResponse.json({ budget });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as any;
  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user.role);
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const org = await prisma.organization.findFirst({ where: { id: params.id, tenantId: user.tenantId } });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { budgetId } = await req.json();
  if (!budgetId) return NextResponse.json({ error: "budgetId required" }, { status: 400 });

  // Unlink requests from this budget before deleting
  await prisma.purchaseRequest.updateMany({ where: { budgetId }, data: { budgetId: null } });
  await prisma.budget.delete({ where: { id: budgetId } });

  return NextResponse.json({ ok: true });
}
