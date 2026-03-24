import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { parseImportRows, parseComplexSheet } from "@/lib/claude";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows, colorHints, type, knownMetadata, rawGrid, isComplex } = await req.json();

  if (!type) {
    return NextResponse.json({ error: "type required" }, { status: 400 });
  }

  // ── Complex multi-table sheet → Sonnet full-sheet analysis ────────────────
  if (isComplex && rawGrid?.length && type === "requests") {
    const { rows: complexRows, metadata, warnings } = await parseComplexSheet(rawGrid, colorHints ?? []);

    // Merge org from knownMetadata or AI-detected metadata
    const org = knownMetadata?.organization || metadata.organization || "";
    const mergedRows = complexRows.map(row => ({
      ...row,
      organization: row.organization || org,
    }));

    return NextResponse.json({
      rows: mergedRows,
      columnMapping: {},
      colorStatusMapping: {},
      statusInference: "default_draft",
      metadata: { ...metadata, ...knownMetadata },
      warnings: warnings.length ? warnings : [`Parsed with full-sheet AI analysis (${mergedRows.length} items found)`],
    });
  }

  // ── Simple single-table sheet → Haiku column mapping ─────────────────────
  if (!rows?.length) {
    return NextResponse.json({ error: "rows required" }, { status: 400 });
  }

  const headers = Object.keys(rows[0] ?? {});

  const { columnMapping, colorStatusMapping, statusInference, metadata, warnings } = await parseImportRows(
    headers,
    rows,
    colorHints ?? [],
    type
  );

  // Apply mapping to all rows, skipping rows with no meaningful mapped content
  const normalized = rows
    .map((row: Record<string, string>, idx: number) => {
      const out: Record<string, string> = {};

      for (const [origCol, targetField] of Object.entries(columnMapping)) {
        if (targetField && row[origCol] !== undefined && row[origCol] !== "") {
          out[targetField as string] = row[origCol];
        }
      }

      // Fill org from metadata if not present (prefer client-extracted knownMetadata)
      const metaOrg = knownMetadata?.organization || metadata.organization;
      if (!out.organization && metaOrg) {
        out.organization = metaOrg;
      }

      // Fill budget_name from metadata cost_center if not already in row
      const metaBudget = knownMetadata?.budget_name || knownMetadata?.cost_center || metadata.cost_center;
      if (!out.budget_name && metaBudget) {
        out.budget_name = metaBudget;
      }

      // Apply color-based status if no explicit status
      if (type === "requests" && !out.status) {
        const rowColor = colorHints?.find((h: { row: number; color: string }) => h.row === idx)?.color;
        if (rowColor && colorStatusMapping[rowColor]) {
          out.status = colorStatusMapping[rowColor];
        }
      }

      return out;
    })
    // Drop rows that are clearly metadata/empty
    .filter((row: Record<string, string>) => {
      if (type === "requests") {
        const hasTitle = !!(row.title || row.description);
        const hasData = !!(row.total_actual || row.unit_price || row.date_ordered || row.date_received || row.vendor || row.url);
        return hasTitle && hasData;
      }
      if (type === "budgets") return !!(row.organization && row.allocated);
      if (type === "members") return !!row.email;
      return true;
    });

  // Merge client-extracted metadata with AI-detected metadata (client wins on conflicts)
  const mergedMetadata = { ...metadata, ...knownMetadata };

  return NextResponse.json({ rows: normalized, columnMapping, colorStatusMapping, statusInference, metadata: mergedMetadata, warnings });
}
