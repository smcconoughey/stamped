import Anthropic from "@anthropic-ai/sdk";

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function parseApprovalEmail(emailBody: string, requestTitle: string, requestNumber: string): Promise<{
  decision: "APPROVED" | "REJECTED" | "NEEDS_INFO" | "UNCLEAR";
  confidence: number;
  summary: string;
  notes?: string;
}> {
  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are parsing an email reply from a faculty advisor regarding a student organization purchase request.

Purchase Request: ${requestNumber} - ${requestTitle}

Email Content:
---
${emailBody}
---

Determine if the advisor:
1. APPROVED the purchase
2. REJECTED the purchase
3. NEEDS_INFO - asked for more information before deciding
4. UNCLEAR - the email is ambiguous or unrelated

Respond in JSON only:
{
  "decision": "APPROVED" | "REJECTED" | "NEEDS_INFO" | "UNCLEAR",
  "confidence": 0.0-1.0,
  "summary": "one sentence summary of the decision",
  "notes": "any conditions, questions, or important details the advisor mentioned"
}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return { decision: "UNCLEAR", confidence: 0, summary: "Could not parse email" };
  }

  try {
    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    return JSON.parse(jsonMatch[0]);
  } catch {
    return { decision: "UNCLEAR", confidence: 0, summary: "Parse error" };
  }
}

export async function summarizeRequestQueue(requests: Array<{
  number: string;
  title: string;
  status: string;
  organization: string;
  priority: string;
  daysOld: number;
}>): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `Summarize the following purchase request queue for an admin. Be concise - 2-3 sentences. Highlight urgent items, bottlenecks, or anything that needs immediate attention.

Queue:
${requests.map((r) => `- ${r.number} | ${r.organization} | ${r.title} | ${r.status} | Priority: ${r.priority} | ${r.daysOld} days old`).join("\n")}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.type === "text" ? textBlock.text : "Queue summary unavailable.";
}

export async function scrapeEmailForRequestStatus(emailBody: string): Promise<{
  foundItems: Array<{
    description: string;
    status: string;
    orderNumber?: string;
    vendor?: string;
    estimatedDelivery?: string;
  }>;
  summary: string;
}> {
  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `Extract purchase/order status information from this email. Look for order numbers, tracking info, delivery dates, vendor info, item descriptions.

Email:
---
${emailBody}
---

Respond in JSON:
{
  "foundItems": [
    {
      "description": "item description",
      "status": "ordered|shipped|delivered|pending|cancelled",
      "orderNumber": "optional",
      "vendor": "optional",
      "estimatedDelivery": "optional date string"
    }
  ],
  "summary": "brief summary of what was found"
}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return { foundItems: [], summary: "Could not parse email" };
  }

  try {
    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON");
    return JSON.parse(jsonMatch[0]);
  } catch {
    return { foundItems: [], summary: "Parse error" };
  }
}

// ── Complex multi-table sheet parsing with Sonnet ────────────────────────────

/**
 * Handles sheets that can't be parsed with simple header detection:
 * - Multiple tables on one sheet
 * - Description tables that reference items in another table by row ID
 * - Instruction/metadata rows intermixed with data
 *
 * Sends the entire raw grid as text to Sonnet and asks it to reconstruct
 * a clean list of purchase request rows with all linked data merged.
 */
export async function parseComplexSheet(
  rawGrid: string[][],
  colorHints: Array<{ row: number; color: string }>
): Promise<{
  rows: Array<Record<string, string>>;
  metadata: Record<string, string>;
  warnings: string[];
}> {
  // Format the grid as a readable representation (cap at 300 rows × 20 cols)
  const MAX_ROWS = 300;
  const MAX_COLS = 20;
  const gridText = rawGrid
    .slice(0, MAX_ROWS)
    .map((row, i) => {
      const cells = row.slice(0, MAX_COLS).map(c => String(c ?? "").trim());
      // Skip rows that are entirely empty
      if (cells.every(c => !c)) return null;
      return `R${i + 1}: ${cells.join(" | ")}`;
    })
    .filter(Boolean)
    .join("\n");

  const colorSample = colorHints.slice(0, 30).map(h => `row ${h.row}: ${h.color}`).join(", ");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: `You are parsing a university student organization budget spreadsheet that may have multiple tables, instruction text, and linked data across sections.

SPREADSHEET CONTENT (R = row number, cells separated by |):
${gridText}

${colorHints.length ? `Row background colors (useful for status): ${colorSample}` : ""}

This spreadsheet may contain:
1. A MAIN ITEMS TABLE with columns like: Row ID, Item/Description, Provider/Vendor, Quantity, Cost Per/Unit Price, Total Cost, Amount Requested
2. A SECONDARY DESCRIPTIONS TABLE where each row has a Row ID (like A1, A2) matching the main table, plus a longer description/justification
3. Metadata rows: organization name, total amounts, instructions (ignore instructions)
4. Table labels like "Table 1", "Table 2", "Funding Request Information" (these are labels, not data)

YOUR TASK:
- Find all items in the main purchase table
- For each item, find its matching description in any secondary table by matching Row IDs (A1→A1, B3→B3, etc.)
- Merge the item data and description into one record
- Extract metadata (org name, document title/category, total requested)

Output fields for each item:
- title: the item name/description from the main table
- description: merged description from the secondary table (if any)
- vendor: provider or vendor name
- quantity: number
- unit_price: cost per item as a decimal string (strip $ signs)
- url: any URL found
- notes: any other relevant info (lifespan, storage, etc.)

Return ONLY valid JSON (no markdown):
{
  "items": [
    {
      "title": "Medium Nitrile Gloves",
      "description": "PPE for handling various chemicals.",
      "vendor": "Uline",
      "quantity": "10",
      "unit_price": "14.00",
      "url": "",
      "notes": ""
    }
  ],
  "metadata": {
    "organization": "",
    "category": "EQUIPMENT",
    "total_requested": ""
  },
  "warnings": ["any issues or assumptions made"]
}`,
    }],
  });

  const text = response.content.find(b => b.type === "text");
  if (!text || text.type !== "text") {
    return { rows: [], metadata: {}, warnings: ["AI parsing unavailable"] };
  }

  try {
    const json = JSON.parse(text.text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    const rows = (json.items ?? []).map((item: Record<string, string>) => ({
      title: item.title ?? "",
      description: item.description ?? "",
      vendor: item.vendor ?? "",
      quantity: item.quantity ?? "",
      unit_price: item.unit_price ?? "",
      url: item.url ?? "",
      notes: item.notes ?? "",
    }));
    return {
      rows,
      metadata: json.metadata ?? {},
      warnings: json.warnings ?? [],
    };
  } catch {
    return { rows: [], metadata: {}, warnings: ["Could not parse AI response"] };
  }
}

// ── Import parsing with Haiku ─────────────────────────────────────────────────

const IMPORT_SCHEMAS = {
  requests: {
    fields: ["organization", "title", "description", "justification", "advisor_email", "advisor_name", "vendor", "quantity", "unit_price", "url", "priority", "status", "needed_by", "notes"],
    statusValues: ["DRAFT", "SUBMITTED", "PENDING_APPROVAL", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "READY_FOR_PICKUP", "PICKED_UP", "CANCELLED"],
    priorityValues: ["LOW", "NORMAL", "HIGH", "URGENT"],
  },
  budgets: {
    fields: ["organization", "budget_name", "project_number", "cost_center", "fiscal_year", "allocated", "notes"],
    statusValues: [] as string[],
    priorityValues: [] as string[],
  },
  members: {
    fields: ["email", "name", "role", "organization"],
    statusValues: [] as string[],
    priorityValues: [] as string[],
  },
};

export async function parseImportRows(
  headers: string[],
  sampleRows: Record<string, string>[],
  colorHints: Array<{ row: number; color: string }>,
  type: "requests" | "budgets" | "members"
): Promise<{
  columnMapping: Record<string, string | null>;
  colorStatusMapping: Record<string, string>;
  statusInference: string;
  metadata: Record<string, string>;
  warnings: string[];
}> {
  const schema = IMPORT_SCHEMAS[type];

  const colorSection = colorHints.length > 0
    ? `\nRow color highlights (row index → dominant fill color hex):\n${JSON.stringify(colorHints.slice(0, 20))}\n\nCommon spreadsheet color conventions for purchase tracking:\n- Green shades (#70AD47, #92D050, #00B050, light greens) → RECEIVED or PICKED_UP\n- Yellow/gold (#FFD966, #FFC000, #FFFF00, #FFF2CC) → ORDERED or IN_PROGRESS\n- Orange (#F4B183, #FF9900, #FCE4D6) → PARTIALLY_RECEIVED\n- Red (#FF7676, #FF0000, #FFCCCC, #FFC7CE) → CANCELLED\n- Blue (#4472C4, #9DC3E6, #DDEBF7) → APPROVED\n- White / no color → DRAFT or SUBMITTED`
    : "";

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1536,
    messages: [{
      role: "user",
      content: `You are normalizing a university student organization spreadsheet for import into a purchasing system.

Import type: ${type}
Expected output fields: ${schema.fields.join(", ")}
${schema.statusValues.length ? `Valid status values: ${schema.statusValues.join(", ")}` : ""}

IMPORTANT: These spreadsheets often have metadata rows at the top (org name, budget total, cost center, project number) BEFORE the actual column headers. The real header row is the one with column labels like "Supplier", "Description", "QTY", "Price", "Date Ordered", etc.

Column headers found (may include metadata rows):
${headers.join(", ")}

Sample rows (first ${Math.min(8, sampleRows.length)}):
${JSON.stringify(sampleRows.slice(0, 8), null, 2)}
${colorSection}

Mapping rules (be liberal):
- "Supplier" / "Vendor" / "Store" → "vendor"
- "Brief Description" / "Item" / "Description" / "Item Name" → "title"
- "QTY" / "Qty." / "Quantity" → "quantity"
- "Price Each" / "Unit Price" / "$ each" / "Cost" → "unit_price"
- "$ amount" / "Invoice" / "Total" / "Amount" → "total_actual"
- "Running Total" / "Balance" / "Running Balance" → null (ignore, it's a calculated field)
- "Weblink" / "URL" / "Link" / "Weblink for the item" / "Weblink for the Item/Comments" → ALWAYS map to "url" even if the column has mixed URL and text content
- "Notes" / "Comments" / "Description" (secondary, when NOT the weblink column) → "notes"
- "Date Ordered" / "Order Date" / "Ordered" → "date_ordered"
- "Date Received" / "Received" / "Delivered" → "date_received"
- "Person to contact" / "Contact" / "Ordered By" → "advisor_name"
- "E-mail" / "Email" / "Contact Email" → "advisor_email"
- "Organization" / "Club" / "Org" / "Department" → "organization"

Status inference (if no explicit status column):
- If "date_received" is filled AND "date_ordered" is filled → RECEIVED
- If "date_ordered" is filled but no "date_received" → ORDERED
- If neither date → DRAFT
Set "status_inference" to one of: "from_column", "from_dates", "default_draft"

Return ONLY valid JSON:
{
  "column_mapping": { "original_header": "expected_field_name_or_null" },
  "color_status_mapping": { "hex_color": "STATUS_VALUE" },
  "status_inference": "from_column|from_dates|default_draft",
  "metadata": { "organization": "...", "budget_total": "...", "cost_center": "...", "fiscal_year": "..." },
  "warnings": ["any issues noticed, e.g. missing required columns"]
}`,
    }],
  });

  const text = response.content.find(b => b.type === "text");
  if (!text || text.type !== "text") {
    return { columnMapping: {}, colorStatusMapping: {}, statusInference: "default_draft", metadata: {}, warnings: ["AI parsing unavailable"] };
  }

  try {
    const json = JSON.parse(text.text.match(/\{[\s\S]*\}/)?.[0] ?? "{}");
    return {
      columnMapping: json.column_mapping ?? {},
      colorStatusMapping: json.color_status_mapping ?? {},
      statusInference: json.status_inference ?? "default_draft",
      metadata: json.metadata ?? {},
      warnings: json.warnings ?? [],
    };
  } catch {
    return { columnMapping: {}, colorStatusMapping: {}, statusInference: "default_draft", metadata: {}, warnings: ["Could not parse AI response"] };
  }
}

export async function generateApprovalEmailDraft(params: {
  advisorName: string;
  advisorEmail: string;
  requestNumber: string;
  requestTitle: string;
  orgName: string;
  studentName: string;
  justification: string;
  totalEstimated: string;
  items: Array<{ name: string; quantity: number; unitPrice?: string }>;
}): Promise<string> {
  const itemsList = params.items
    .map((i) => `  - ${i.name} (qty: ${i.quantity}${i.unitPrice ? `, ~$${i.unitPrice} each` : ""})`)
    .join("\n");

  return `Dear ${params.advisorName || "Advisor"},

A purchase request has been submitted for your review and approval.

Request Number: ${params.requestNumber}
Organization: ${params.orgName}
Submitted by: ${params.studentName}
Estimated Total: ${params.totalEstimated}

Items Requested:
${itemsList}

Justification:
${params.justification}

Please reply to this email with your approval or any questions. Your reply will be automatically recorded.

- Reply "Approved" or "I approve this request" to approve
- Reply with questions or concerns to request more information
- Reply "Rejected" or explain why to decline

This request can also be viewed in the Stamped purchasing portal.

Thank you,
Purchasing Services`;
}
