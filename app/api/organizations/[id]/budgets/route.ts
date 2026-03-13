import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const role = (session.user as any).role;
  const allowedRoles = ["ORG_LEAD", "ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"];
  if (!allowedRoles.includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Verify org belongs to this tenant
  const org = await prisma.organization.findFirst({ where: { id: params.id, tenantId } });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { name, fiscalYear, allocated, notes } = await req.json();
  if (!name || !fiscalYear || allocated == null) {
    return NextResponse.json({ error: "name, fiscalYear, and allocated are required" }, { status: 400 });
  }

  const existing = await prisma.budget.findFirst({
    where: { organizationId: params.id, fiscalYear, name },
  });
  if (existing) return NextResponse.json({ error: "A budget with that name already exists for this fiscal year" }, { status: 409 });

  const budget = await prisma.budget.create({
    data: { organizationId: params.id, name, fiscalYear, allocated: parseFloat(allocated), notes: notes || null },
  });

  return NextResponse.json({ budget });
}
