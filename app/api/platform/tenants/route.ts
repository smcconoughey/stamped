import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

function isPlatformAdmin(session: any) {
  return session?.user?.role === "PLATFORM_ADMIN";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isPlatformAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const tenants = await prisma.tenant.findMany({
    include: {
      _count: { select: { users: true, organizations: true } },
      settings: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ tenants });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isPlatformAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { tenantName, domain, adminName, adminEmail, adminPassword } = await req.json();

  if (!tenantName || !domain || !adminEmail) {
    return NextResponse.json({ error: "tenantName, domain, and adminEmail are required" }, { status: 400 });
  }

  const slug = domain.split(".")[0].toLowerCase().replace(/[^a-z0-9]/g, "-");

  // Check domain not already taken
  const existing = await prisma.tenant.findFirst({ where: { OR: [{ domain }, { slug }] } });
  if (existing) return NextResponse.json({ error: "Domain already registered" }, { status: 409 });

  const passwordHash = adminPassword ? await bcrypt.hash(adminPassword, 12) : null;

  const tenant = await prisma.tenant.create({
    data: {
      name: tenantName,
      domain,
      slug,
      settings: {
        create: { requestPrefix: "REQ", requireAdvisorApproval: true },
      },
      users: {
        create: {
          email: adminEmail,
          name: adminName || adminEmail,
          role: "ADMIN_STAFF",
          active: true,
          password: passwordHash,
        },
      },
    },
    include: {
      users: true,
      _count: { select: { users: true, organizations: true } },
    },
  });

  return NextResponse.json({ tenant });
}
