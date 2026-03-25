import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withTelemetry } from "@/lib/telemetry";

// GET: fetch orgs available to join for this tenant
export const GET = withTelemetry(async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = (session.user as any).tenantId;
  const orgs = await prisma.organization.findMany({
    where: { tenantId, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, code: true, department: true },
  });

  return NextResponse.json({ orgs });
});

// POST: complete onboarding
export const POST = withTelemetry(async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = (session.user as any).id;
  const tenantId = (session.user as any).tenantId;
  const { role, orgId, orgName, orgCode, orgDepartment, orgAdvisorName, orgAdvisorEmail } = await req.json();

  const allowedRoles = ["STUDENT", "ORG_LEAD", "ADVISOR", "ADMIN_STAFF", "FINANCE_ADMIN"];
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  let resolvedOrgId = orgId ?? null;

  // If ORG_LEAD and creating a new org
  if (role === "ORG_LEAD" && !orgId && orgName && orgCode) {
    const existing = await prisma.organization.findFirst({
      where: { tenantId, code: orgCode.toUpperCase() },
    });
    if (existing) {
      return NextResponse.json({ error: "An organization with that code already exists" }, { status: 409 });
    }
    const org = await prisma.organization.create({
      data: {
        name: orgName,
        code: orgCode.toUpperCase(),
        department: orgDepartment || null,
        advisorName: orgAdvisorName || null,
        advisorEmail: orgAdvisorEmail || null,
        tenantId,
        active: true,
      },
    });
    resolvedOrgId = org.id;
  }

  // Update user role and mark onboarded
  await prisma.user.update({
    where: { id: userId },
    data: { role, onboarded: true },
  });

  // Add org membership if applicable
  if (resolvedOrgId && (role === "ORG_LEAD" || role === "STUDENT")) {
    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: resolvedOrgId, userId } },
      create: {
        organizationId: resolvedOrgId,
        userId,
        memberRole: role === "ORG_LEAD" ? "LEAD" : "MEMBER",
      },
      update: {
        memberRole: role === "ORG_LEAD" ? "LEAD" : "MEMBER",
      },
    });
  }

  return NextResponse.json({ ok: true });
});
