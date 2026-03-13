import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Returns all budgets the current user can assign requests to
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as any;
  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user.role);
  const isOrgLead = user.role === "ORG_LEAD";

  let orgWhere: any = { tenantId: user.tenantId, active: true };

  if (!isAdmin && isOrgLead) {
    const memberships = await prisma.organizationMember.findMany({
      where: { userId: user.id, memberRole: "LEAD" },
      select: { organizationId: true },
    });
    orgWhere.id = { in: memberships.map((m: any) => m.organizationId) };
  } else if (!isAdmin && !isOrgLead) {
    return NextResponse.json({ budgets: [] });
  }

  const orgs = await prisma.organization.findMany({
    where: orgWhere,
    include: { budgets: { orderBy: [{ fiscalYear: "desc" }, { name: "asc" }] } },
    orderBy: { name: "asc" },
  });

  const budgets = orgs.flatMap((org) =>
    org.budgets.map((b) => ({
      id: b.id,
      name: b.name,
      fiscalYear: b.fiscalYear,
      orgId: org.id,
      orgName: org.name,
      orgCode: org.code,
      label: `${org.code} — ${b.name} (${b.fiscalYear})`,
    }))
  );

  return NextResponse.json({ budgets });
}
