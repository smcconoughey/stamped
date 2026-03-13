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
  const isOrgLead = user.role === "ORG_LEAD";

  if (!isAdmin && !isOrgLead) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ORG_LEAD can only import into orgs they lead
  let allowedOrgIds: string[] | null = null;
  if (isOrgLead) {
    const memberships = await prisma.organizationMember.findMany({
      where: { userId: user.id, memberRole: "LEAD" },
      select: { organizationId: true },
    });
    allowedOrgIds = memberships.map((m: { organizationId: string }) => m.organizationId);
    if (allowedOrgIds.length === 0) {
      return NextResponse.json({ error: "You are not a lead of any organization" }, { status: 403 });
    }
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

        // If org not found by name/code and ORG_LEAD has exactly one org, default to it
        if (!orgId && allowedOrgIds?.length === 1) {
          orgId = allowedOrgIds[0];
        }

        if (!orgId) {
          results.errors.push(`Row ${i + 1}: Organization "${orgKey}" not found`);
          results.skipped++;
          continue;
        }

        // ORG_LEAD can only import into their own orgs
        if (allowedOrgIds && !allowedOrgIds.includes(orgId)) {
          results.errors.push(`Row ${i + 1}: You do not have lead access to that organization`);
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

        const unitPrice = parseFloat(row.unit_price || row.price || row.cost || "0") || null;
        const quantity = parseInt(row.quantity || row.qty || "1") || 1;
        const totalActual = parseFloat(row.total_actual || row.amount || row.invoice_amount || "0") || null;
        const totalEstimated = unitPrice ? unitPrice * quantity : totalActual;

        // Status: use explicit status field, or infer from date columns
        const VALID_STATUSES = ["DRAFT","SUBMITTED","PENDING_APPROVAL","APPROVED","ORDERED","PARTIALLY_RECEIVED","RECEIVED","READY_FOR_PICKUP","PICKED_UP","CANCELLED"];
        let status = "DRAFT";
        if (row.status && VALID_STATUSES.includes(row.status.toUpperCase())) {
          status = row.status.toUpperCase();
        } else if (row.date_received || row.received_at) {
          status = "RECEIVED";
        } else if (row.date_ordered || row.ordered_at) {
          status = "ORDERED";
        }

        const orderedAt = row.date_ordered || row.ordered_at ? new Date(row.date_ordered || row.ordered_at) : null;
        const receivedAt = row.date_received || row.received_at ? new Date(row.date_received || row.received_at) : null;

        await prisma.purchaseRequest.create({
          data: {
            number,
            title,
            description: row.description || null,
            justification: row.justification || row.reason || "Imported from spreadsheet",
            organizationId: orgId,
            submittedById: user.id,
            advisorEmail: row.advisor_email || row.contact_email || "tbd@university.edu",
            advisorName: row.advisor_name || row.person_to_contact || null,
            vendorName: row.vendor || row.vendor_name || row.supplier || null,
            vendorUrl: row.url || row.link || row.weblink || null,
            notes: row.notes || row.comments || null,
            status,
            priority: (row.priority || "NORMAL").toUpperCase(),
            totalEstimated: totalEstimated || null,
            totalActual: totalActual || null,
            neededBy: row.needed_by ? new Date(row.needed_by) : null,
            orderedAt: orderedAt && !isNaN(orderedAt.getTime()) ? orderedAt : null,
            receivedAt: receivedAt && !isNaN(receivedAt.getTime()) ? receivedAt : null,
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
