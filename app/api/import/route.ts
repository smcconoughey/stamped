import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateRequestNumber } from "@/lib/utils";

// Try multiple possible column names, return first non-empty value
function col(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const v = row[key]?.trim();
    if (v) return v;
  }
  return "";
}

// Parse a date that might be an Excel serial number or a date string
function parseDate(val: string): Date | null {
  if (!val?.trim()) return null;
  const num = Number(val);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    // Excel date serial — days since 1900-01-01 (with Lotus bug offset)
    return new Date((num - 25569) * 86400 * 1000);
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

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
    const { rows, metadata = {}, forceBudgetId } = body; // Array of CSV row objects + spreadsheet metadata

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No data rows provided" }, { status: 400 });
    }

    const settings = await prisma.tenantSettings.findUnique({
      where: { tenantId: user.tenantId },
    });

    const orgs = await prisma.organization.findMany({
      where: { tenantId: user.tenantId, active: true },
      include: { budgets: true },
    });

    const orgByName: Record<string, string> = {};
    const orgByCode: Record<string, string> = {};
    // Map "orgId:budgetName.toLowerCase()" → budgetId for fast lookup
    const budgetByOrgAndName: Record<string, string> = {};
    for (const org of orgs) {
      orgByName[org.name.toLowerCase()] = org.id;
      orgByCode[org.code.toLowerCase()] = org.id;
      for (const budget of (org as any).budgets) {
        budgetByOrgAndName[`${org.id}:${budget.name.toLowerCase()}`] = budget.id;
      }
    }

    // Pre-resolve the org for this import (used for budget auto-creation)
    const metaOrgKey = (metadata.organization || "").toLowerCase().trim();
    const metaOrgId: string | null =
      orgByName[metaOrgKey] || orgByCode[metaOrgKey] ||
      (allowedOrgIds?.length ? allowedOrgIds[0] : null) || null;

    // Auto-upsert budget from spreadsheet metadata if we have enough info
    const metaBudgetName: string = metadata.budget_name || metadata.cost_center || "";
    const metaFiscalYear: string = metadata.fiscal_year || new Date().getFullYear().toString();
    const metaAllocated: number = parseFloat(metadata.budget_total?.replace(/[^0-9.]/g, "") || "0") || 0;

    if (metaOrgId && metaBudgetName) {
      const cacheKey = `${metaOrgId}:${metaBudgetName.toLowerCase()}`;
      if (!budgetByOrgAndName[cacheKey]) {
        const upserted = await prisma.budget.upsert({
          where: { organizationId_fiscalYear_name: { organizationId: metaOrgId, fiscalYear: metaFiscalYear, name: metaBudgetName } },
          create: { organizationId: metaOrgId, name: metaBudgetName, fiscalYear: metaFiscalYear, allocated: metaAllocated },
          update: metaAllocated > 0 ? { allocated: metaAllocated } : {},
        });
        budgetByOrgAndName[cacheKey] = upserted.id;
      }
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
        // Try to find organization by exact name or code
        const orgKey = (row.organization || row.org || row.club || "").toLowerCase().trim();
        let orgId = orgByName[orgKey] || orgByCode[orgKey];

        // Try partial match if exact fails (e.g. "ERPL" matches "ERPL Robotics" or vice versa)
        if (!orgId && orgKey) {
          const partialMatch = Object.keys(orgByName).find((k) => k.includes(orgKey) || orgKey.includes(k));
          if (partialMatch) orgId = orgByName[partialMatch];
          if (!orgId) {
            const codeMatch = Object.keys(orgByCode).find((k) => k.includes(orgKey) || orgKey.includes(k));
            if (codeMatch) orgId = orgByCode[codeMatch];
          }
        }

        // If org key is blank or still not found, fall back:
        // - ORG_LEAD with exactly one org → use that org
        // - ORG_LEAD with multiple orgs but no org specified → use first allowed org
        if (!orgId && allowedOrgIds) {
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

        // ── Field extraction — covers raw column names AND AI-normalized names ──
        const title =
          col(row, "title", "name", "item", "item_name", "brief_description", "description", "brief_desc", "item_description") ||
          col(row, "vendor", "vendor_name", "supplier", "store", "source") ||  // use vendor as fallback title
          null;

        if (!title) {
          results.skipped++;
          continue;
        }

        const unitPrice = parseFloat(col(row, "unit_price", "price_each", "price", "cost", "each", "unit_cost")) || null;
        const quantity = parseInt(col(row, "quantity", "qty", "qty_", "count")) || 1;
        // total_actual from the invoice amount column — NOT from running total/balance
        const totalActual = parseFloat(col(row, "total_actual", "amount_of_charge_invoice", "_amount_of_charge_invoice", "invoice_amount", "charge", "total_charge")) || null;
        const totalEstimated = unitPrice ? unitPrice * quantity : totalActual;

        // Status: explicit field, or infer from date columns
        const VALID_STATUSES = ["DRAFT","SUBMITTED","PENDING_APPROVAL","APPROVED","ORDERED","PARTIALLY_RECEIVED","RECEIVED","READY_FOR_PICKUP","PICKED_UP","CANCELLED"];
        const statusRaw = col(row, "status");
        const dateOrderedRaw = col(row, "date_ordered", "ordered_at", "order_date", "date_order");
        const dateReceivedRaw = col(row, "date_received", "received_at", "receipt_date", "date_receipt");

        let status = "DRAFT";
        if (statusRaw && VALID_STATUSES.includes(statusRaw.toUpperCase())) {
          status = statusRaw.toUpperCase();
        } else if (dateReceivedRaw) {
          status = "RECEIVED";
        } else if (dateOrderedRaw) {
          status = "ORDERED";
        }

        const orderedAt = parseDate(dateOrderedRaw);
        const receivedAt = parseDate(dateReceivedRaw);

        const vendorName = col(row, "vendor", "vendor_name", "supplier", "store", "source");

        // URL extraction: check dedicated URL columns first, then scan all values for a URL
        // (AI sometimes maps "Weblink for the Item/Comments" → "notes" when cells have mixed content)
        const urlExplicit = col(row, "url", "link", "weblink", "weblink_for_the_item_comments");
        const notesRaw = col(row, "notes", "comments", "note");
        // Find any URL buried in notes or any other column value
        const urlFromNotes = notesRaw.match(/https?:\/\/\S+/)?.[0] ?? "";
        const urlFromAnyCol = !urlExplicit && !urlFromNotes
          ? (Object.values(row).find((v) => typeof v === "string" && (v as string).startsWith("http")) as string | undefined) ?? ""
          : "";
        const urlRaw = urlExplicit || urlFromNotes || urlFromAnyCol;
        const vendorUrl = urlRaw.startsWith("http") ? urlRaw : null;

        // Notes: keep non-URL content from notes column; strip the URL we already extracted
        const notesFromWeblink = urlExplicit && !urlExplicit.startsWith("http") ? urlExplicit : "";
        const notesFromCol = vendorUrl
          ? notesRaw.replace(vendorUrl, "").trim().replace(/^\||\|$/g, "").trim()
          : notesRaw;
        const notes = [notesFromWeblink, notesFromCol].filter(Boolean).join(" | ") || null;

        // Skip rows with no financial substance — just a label/category title and nothing else
        // e.g. "Price Difference/Shipping or handling" with no amount, vendor, date, or URL
        const hasSubstance = !!(unitPrice || totalActual || orderedAt || receivedAt || vendorName || vendorUrl);
        if (!hasSubstance) {
          results.skipped++;
          continue;
        }

        currentNum++;
        const number = generateRequestNumber(prefix, currentNum);

        const advisorEmail = col(row, "advisor_email", "contact_email", "e_mail_address", "email_address", "email");
        const advisorName = col(row, "advisor_name", "person_to_contact_for_order", "person_to_contact", "contact_person", "ordered_by", "contact");

        // Resolve budget — forceBudgetId from import UI takes priority; else from row column
        let budgetId: string | null = null;
        if (forceBudgetId) {
          budgetId = forceBudgetId;
        } else {
          const budgetNameRaw = col(row, "budget_name", "budget", "cost_center", "fund", "account");
          budgetId = budgetNameRaw
            ? budgetByOrgAndName[`${orgId}:${budgetNameRaw.toLowerCase()}`] ?? null
            : null;
        }

        await prisma.purchaseRequest.create({
          data: {
            number,
            title,
            description: col(row, "description") || null,
            justification: col(row, "justification", "reason", "purpose") || "Imported from spreadsheet",
            organizationId: orgId,
            budgetId: budgetId || undefined,
            submittedById: user.id,
            advisorEmail: advisorEmail || "tbd@university.edu",
            advisorName: advisorName || null,
            vendorName: vendorName || null,
            vendorUrl,
            notes,
            status,
            priority: (col(row, "priority") || "NORMAL").toUpperCase(),
            totalEstimated: totalEstimated || null,
            totalActual: totalActual || null,
            neededBy: parseDate(col(row, "needed_by", "need_by", "due_date")),
            orderedAt,
            receivedAt,
            items: {
              create: [{
                name: title,
                quantity,
                unitPrice: unitPrice || null,
                totalPrice: totalActual || totalEstimated || null,
                url: vendorUrl,
              }],
            },
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
