import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { parseImportRows } from "@/lib/claude";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows, colorHints, type } = await req.json();

  if (!rows?.length || !type) {
    return NextResponse.json({ error: "rows and type required" }, { status: 400 });
  }

  const headers = Object.keys(rows[0] ?? {});

  // Get column mapping + color→status mapping from Haiku
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

      // Fill org from metadata if not present
      if (!out.organization && metadata.organization) {
        out.organization = metadata.organization;
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
    // Drop rows that are clearly metadata/empty (no title/description mapped)
    .filter((row: Record<string, string>) => {
      if (type === "requests") return !!(row.title || row.description);
      if (type === "budgets") return !!(row.organization && row.allocated);
      if (type === "members") return !!row.email;
      return true;
    });

  return NextResponse.json({ rows: normalized, columnMapping, colorStatusMapping, statusInference, metadata, warnings });
}
