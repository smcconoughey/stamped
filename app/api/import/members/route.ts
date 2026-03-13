import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as any;
  const allowedRoles = ["ORG_LEAD", "ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"];
  if (!allowedRoles.includes(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { rows, orgId: defaultOrgId } = await req.json();
  if (!rows?.length) return NextResponse.json({ error: "No rows provided" }, { status: 400 });

  const orgs = await prisma.organization.findMany({
    where: { tenantId: user.tenantId, active: true },
  });
  const byName: Record<string, string> = {};
  const byCode: Record<string, string> = {};
  for (const o of orgs) {
    byName[o.name.toLowerCase()] = o.id;
    byCode[o.code.toLowerCase()] = o.id;
  }

  const results = { imported: 0, skipped: 0, errors: [] as string[] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const email = (row.email || "").trim().toLowerCase();
      if (!email) { results.errors.push(`Row ${i + 1}: Missing email`); results.skipped++; continue; }

      const orgKey = (row.organization || row.org || "").toLowerCase().trim();
      const orgId = orgKey ? (byName[orgKey] || byCode[orgKey]) : defaultOrgId;
      if (!orgId) { results.errors.push(`Row ${i + 1}: No org found for "${orgKey}"`); results.skipped++; continue; }

      const role = (row.role || "STUDENT").toUpperCase();
      const memberRole = role === "ORG_LEAD" ? "LEAD" : "MEMBER";
      const passwordHash = row.password ? await bcrypt.hash(row.password, 12) : null;

      const member = await prisma.user.upsert({
        where: { email },
        create: {
          email,
          name: row.name || email,
          role,
          tenantId: user.tenantId,
          active: true,
          onboarded: true,
          ...(passwordHash ? { password: passwordHash } : {}),
        },
        update: {
          name: row.name || undefined,
          role,
          ...(passwordHash ? { password: passwordHash } : {}),
        },
      });

      await prisma.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: orgId, userId: member.id } },
        create: { organizationId: orgId, userId: member.id, memberRole },
        update: { memberRole },
      });

      results.imported++;
    } catch (err) {
      results.errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : "Unknown error"}`);
      results.skipped++;
    }
  }

  return NextResponse.json({ results });
}
