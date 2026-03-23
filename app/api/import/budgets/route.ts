import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as any;
  const allowedRoles = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"];
  if (!allowedRoles.includes(user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { rows } = await req.json();
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
      const orgKey = (row.organization || row.org || row.club || "").toLowerCase().trim();
      const orgId = byName[orgKey] || byCode[orgKey];
      if (!orgId) { results.errors.push(`Row ${i + 1}: Org "${orgKey}" not found`); results.skipped++; continue; }

      const name = (row.budget_name || row.name || "General").trim();
      const fiscalYear = (row.fiscal_year || row.year || "").trim();
      const allocated = parseFloat(row.allocated || row.amount || 0);
      const costCenter = (row.cost_center || row.costcenter || "").trim() || null;
      const projectNumber = (row.project_number || row.project || row.pj || "").trim() || null;

      if (!fiscalYear) { results.errors.push(`Row ${i + 1}: Missing fiscal_year`); results.skipped++; continue; }
      if (!allocated) { results.errors.push(`Row ${i + 1}: Missing or zero allocated amount`); results.skipped++; continue; }

      await prisma.budget.upsert({
        where: { organizationId_fiscalYear_name: { organizationId: orgId, fiscalYear, name } },
        update: { allocated, costCenter, projectNumber },
        create: { organizationId: orgId, name, fiscalYear, allocated, costCenter, projectNumber, notes: row.notes || null },
      });
      results.imported++;
    } catch (err) {
      results.errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : "Unknown error"}`);
      results.skipped++;
    }
  }

  return NextResponse.json({ results });
}
