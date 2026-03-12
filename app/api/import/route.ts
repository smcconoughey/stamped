import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateRequestNumber } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user.role);

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { rows } = body; // Array of CSV row objects

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No data rows provided" }, { status: 400 });
    }

    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId: user.tenantId },
    });

    const orgs = await prisma.organization.findMany({
      where: { tenantId: user.tenantId, active: true },
    });

    const orgByName: Record<string, string> = {};
    const orgByCode: Record<string, string> = {};
    for (const org of orgs) {
      orgByName[org.name.toLowerCase()] = org.id;
      orgByCode[org.code.toLowerCase()] = org.id;
    }

    const results = {
      imported: 0,
      skipped: 0,
      errors: [] as string[],
    };

    let currentNum = settings?.currentRequestNumber || 0;
    const prefix = settings?.requestPrefix || "REQ";

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        // Try to find organization
        const orgKey = (row.organization || row.org || row.club || "").toLowerCase().trim();
        let orgId = orgByName[orgKey] || orgByCode[orgKey];

        if (!orgId) {
          results.errors.push(`Row ${i + 1}: Organization "${orgKey}" not found`);
          results.skipped++;
          continue;
        }

        const title = row.title || row.name || row.item || "";
        if (!title) {
          results.errors.push(`Row ${i + 1}: Missing title/item name`);
          results.skipped++;
          continue;
        }

        currentNum++;
        const number = generateRequestNumber(prefix, currentNum);

        const unitPrice = parseFloat(row.unit_price || row.price || row.cost || 0);
        const quantity = parseInt(row.quantity || row.qty || 1);
        const totalEstimated = unitPrice * quantity;

        await prisma.purchaseRequest.create({
          data: {
            number,
            title,
            description: row.description || null,
            justification: row.justification || row.reason || "Imported from CSV",
            organizationId: orgId,
            submittedById: user.id,
            advisorEmail: row.advisor_email || row.advisor || "tbd@university.edu",
            advisorName: row.advisor_name || null,
            vendorName: row.vendor || row.vendor_name || null,
            status: "DRAFT",
            priority: (row.priority || "NORMAL").toUpperCase(),
            totalEstimated: totalEstimated || null,
            neededBy: row.needed_by ? new Date(row.needed_by) : null,
            items: title
              ? {
                  create: [
                    {
                      name: title,
                      quantity: quantity || 1,
                      unitPrice: unitPrice || null,
                      totalPrice: totalEstimated || null,
                      url: row.url || row.link || null,
                    },
                  ],
                }
              : undefined,
          },
        });

        results.imported++;
      } catch (err) {
        results.errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : "Unknown error"}`);
        results.skipped++;
      }
    }

    // Update sequence number
    if (results.imported > 0) {
      await prisma.tenantSettings.upsert({
        where: { tenantId: user.tenantId },
        update: { currentRequestNumber: currentNum },
        create: {
          tenantId: user.tenantId,
          requestPrefix: prefix,
          currentRequestNumber: currentNum,
        },
      });
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
}
