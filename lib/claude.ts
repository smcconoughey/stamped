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

// ── Import parsing with Haiku ─────────────────────────────────────────────────

const IMPORT_SCHEMAS = {
  requests: {
    fields: ["organization", "title", "description", "justification", "advisor_email", "advisor_name", "vendor", "quantity", "unit_price", "url", "priority", "status", "needed_by", "notes"],
    statusValues: ["DRAFT", "SUBMITTED", "PENDING_APPROVAL", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "READY_FOR_PICKUP", "PICKED_UP", "CANCELLED"],
    priorityValues: ["LOW", "NORMAL", "HIGH", "URGENT"],
  },
  budgets: {
    fields: ["organization", "budget_name", "fiscal_year", "allocated", "notes"],
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
- "Weblink" / "URL" / "Link" / "Comments" → "url" (if it looks like a URL column)
- "Notes" / "Comments" / "Description" (secondary) → "notes"
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
