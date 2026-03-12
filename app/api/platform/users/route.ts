import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (session?.user && (session.user as any).role !== "PLATFORM_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { tenantId, email, name, role, password } = await req.json();
  if (!tenantId || !email) return NextResponse.json({ error: "tenantId and email required" }, { status: 400 });

  const passwordHash = password ? await bcrypt.hash(password, 12) : null;

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: name || email,
      role: role || "STUDENT",
      tenantId,
      active: true,
      password: passwordHash,
    },
    update: {
      name: name || undefined,
      role: role || undefined,
      tenantId,
      active: true,
      ...(passwordHash ? { password: passwordHash } : {}),
    },
  });

  return NextResponse.json({ user: { id: user.id, email: user.email, role: user.role } });
}
