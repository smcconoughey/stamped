import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function isPlatformAdmin(session: any) {
  return session?.user?.role === "PLATFORM_ADMIN";
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!isPlatformAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const orgs = await prisma.organization.findMany({
    where: { tenantId: params.id },
    orderBy: { name: "asc" },
    include: { _count: { select: { members: true, requests: true } } },
  });

  return NextResponse.json({ orgs });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!isPlatformAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { name, code, department, costCenter, notes } = await req.json();
  if (!name || !code) return NextResponse.json({ error: "name and code required" }, { status: 400 });

  const existing = await prisma.organization.findFirst({ where: { tenantId: params.id, code } });
  if (existing) return NextResponse.json({ error: "Code already in use for this tenant" }, { status: 409 });

  const org = await prisma.organization.create({
    data: { name, code: code.toUpperCase(), tenantId: params.id, department, costCenter, notes, active: true },
  });

  return NextResponse.json({ org });
}
