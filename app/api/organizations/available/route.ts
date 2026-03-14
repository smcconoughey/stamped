import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Returns all active orgs in the tenant, with the student's current membership status
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as any;

  // Get all active orgs in the tenant
  const orgs = await prisma.organization.findMany({
    where: { tenantId: user.tenantId, active: true },
    select: { id: true, name: true, code: true, department: true },
    orderBy: { name: "asc" },
  });

  // Get this user's memberships
  const memberships = await prisma.organizationMember.findMany({
    where: { userId: user.id },
    select: { organizationId: true, status: true, memberRole: true },
  });
  const membershipMap = new Map(memberships.map(m => [m.organizationId, m]));

  // Return orgs annotated with membership status (or null if not a member)
  const result = orgs.map(org => ({
    ...org,
    membership: membershipMap.get(org.id) ?? null,
  }));

  return NextResponse.json({ orgs: result });
}
