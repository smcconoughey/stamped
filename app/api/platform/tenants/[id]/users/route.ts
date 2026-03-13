import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

function isPlatformAdmin(session: any) {
  return session?.user?.role === "PLATFORM_ADMIN";
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!isPlatformAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const users = await prisma.user.findMany({
    where: { tenantId: params.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, name: true, role: true, active: true, azureId: true, createdAt: true },
  });

  return NextResponse.json({ users });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!isPlatformAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  await prisma.user.delete({ where: { id: userId } });

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!isPlatformAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId, role, password, active } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const update: any = {};
  if (role !== undefined) update.role = role;
  if (active !== undefined) update.active = active;
  if (password) update.password = await bcrypt.hash(password, 12);

  const user = await prisma.user.update({
    where: { id: userId },
    data: update,
    select: { id: true, email: true, name: true, role: true, active: true },
  });

  return NextResponse.json({ user });
}
