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
