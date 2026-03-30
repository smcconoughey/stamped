import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { anthropic } from "@/lib/claude";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mailer";
import { randomUUID } from "crypto";
import { withTelemetry, trackAiCall } from "@/lib/telemetry";

export const POST = withTelemetry(async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messages, context } = await req.json();
  if (!messages?.length) return NextResponse.json({ error: "messages required" }, { status: 400 });

  const user = session.user as any;
  const userId = user.id;
  const tenantId = user.tenantId;
  const role = user.role;
  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(role);
  const isOrgLead = role === "ORG_LEAD";

  const systemPrompt = `You are a concise assistant inside Stamped, a purchasing management app for university student orgs.

Current user: ${user.name || "User"} (${role})
${context ? `Page: ${context}` : ""}

Rules:
- Keep answers to 1-3 short sentences. No bullet lists unless asked.
- Use the tools to look up real data before answering questions about requests, budgets, or orgs.
- When the user asks to do something (resend email, change status), just do it and confirm briefly.
- Never say "I don't have access" — you DO have access. Use the tools.
- Use natural language for statuses: "pending approval" not "PENDING_APPROVAL".
- If a search returns no results, try broader terms or search without filters before saying "not found".
- If the user gives a partial number like "0236", try searching for it as-is — the search is fuzzy.
- IMPORTANT: The request's "status" field is the single source of truth for where a request stands. Approval records track what an advisor did, but the request status may have been changed afterward (e.g. rolled back by an admin). Never say a request is "approved" if its status is "SUBMITTED" — report the actual status and only mention approvals as historical context if relevant.`;

  const tools: any[] = [
    {
      name: "search_requests",
      description: "Search purchase requests. Case-insensitive fuzzy search by keyword, vendor, title, number, or description. Returns up to 20 results.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: { type: "string", description: "Search term — matches title, number, vendor name, or description (case-insensitive)" },
          status: { type: "string", description: "Filter by status: DRAFT, SUBMITTED, PENDING_APPROVAL, APPROVED, ORDERED, RECEIVED, READY_FOR_PICKUP, PICKED_UP, CANCELLED, REJECTED, ON_HOLD" },
        },
        required: [],
      },
    },
    {
      name: "get_request",
      description: "Get full details of a specific purchase request by ID or request number (e.g. ERPL-2026-001).",
      input_schema: {
        type: "object" as const,
        properties: {
          id: { type: "string", description: "Request ID (cuid) or request number" },
        },
        required: ["id"],
      },
    },
    {
      name: "update_request_status",
      description: "Change the status of a purchase request.",
      input_schema: {
        type: "object" as const,
        properties: {
          requestId: { type: "string", description: "The request ID" },
          status: { type: "string", description: "New status" },
          note: { type: "string", description: "Optional note" },
        },
        required: ["requestId", "status"],
      },
    },
    {
      name: "send_approval_email",
      description: "Send or resend an advisor approval email for a purchase request. Returns whether the email was actually delivered.",
      input_schema: {
        type: "object" as const,
        properties: {
          requestId: { type: "string", description: "The request ID" },
        },
        required: ["requestId"],
      },
    },
    {
      name: "list_organizations",
      description: "List organizations the user has access to.",
      input_schema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    },
    {
      name: "get_budgets",
      description: "Get budgets, optionally filtered by organization.",
      input_schema: {
        type: "object" as const,
        properties: {
          organizationId: { type: "string", description: "Filter by org ID" },
        },
        required: [],
      },
    },
  ];

  const claudeMessages: any[] = messages.map((m: { role: string; content: string }) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  let finalText = "Sorry, something went wrong.";
  for (let i = 0; i < 5; i++) {
    const response = await trackAiCall(
      () => anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system: systemPrompt,
        tools,
        messages: claudeMessages,
      }),
      "claude-haiku-4-5-20251001",
      "ai-chat"
    );

    const textBlock = response.content.find((b: any) => b.type === "text");
    if (textBlock?.type === "text") finalText = textBlock.text;

    const toolUses = response.content.filter((b: any) => b.type === "tool_use");
    if (toolUses.length === 0) break;

    claudeMessages.push({ role: "assistant", content: response.content });

    const toolResults: any[] = [];
    for (const tu of toolUses) {
      if (tu.type !== "tool_use") continue;
      let result = await executeTool(tu.name, tu.input as Record<string, string>, {
        userId, tenantId, role, isAdmin, isOrgLead,
        host: req.headers.get("host") || "",
        proto: req.headers.get("host")?.startsWith("localhost") ? "http" : "https",
      });
      // FERPA: scrub PII from tool results before sending to external AI
      let resultJson = JSON.stringify(result);
      resultJson = resultJson.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email redacted]");
      toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: resultJson });
    }
    claudeMessages.push({ role: "user", content: toolResults });
  }

  return NextResponse.json({ reply: finalText });
});

// ── Tool dispatch ────────────────────────────────────────────────────────────

interface Ctx {
  userId: string;
  tenantId: string;
  role: string;
  isAdmin: boolean;
  isOrgLead: boolean;
  host: string;
  proto: string;
}

async function executeTool(name: string, input: Record<string, string>, ctx: Ctx): Promise<unknown> {
  try {
    switch (name) {
      case "search_requests": return await searchRequests(input, ctx);
      case "get_request": return await getRequest(input, ctx);
      case "update_request_status": return await updateRequestStatus(input, ctx);
      case "send_approval_email": return await sendApprovalEmailTool(input, ctx);
      case "list_organizations": return await listOrganizations(ctx);
      case "get_budgets": return await getBudgets(input, ctx);
      default: return { error: "Unknown tool" };
    }
  } catch (err: any) {
    console.error(`[ai-chat] tool ${name} error:`, err);
    return { error: `Tool failed: ${err.message}` };
  }
}

// ── Search — case-insensitive by fetching broadly and filtering in JS ────────

async function searchRequests(input: Record<string, string>, ctx: Ctx) {
  const where: any = {};

  // Scope by role
  if (!ctx.isAdmin) {
    if (ctx.isOrgLead) {
      const memberships = await prisma.organizationMember.findMany({
        where: { userId: ctx.userId },
        select: { organizationId: true },
      });
      where.organizationId = { in: memberships.map((m) => m.organizationId) };
    } else {
      where.submittedById = ctx.userId;
    }
  } else {
    where.organization = { tenantId: ctx.tenantId };
  }

  if (input.status) where.status = input.status;

  // When searching, use DB-level filtering instead of loading hundreds of rows
  if (input.query) {
    const q = input.query;
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { number: { contains: q, mode: "insensitive" } },
      { vendorName: { contains: q, mode: "insensitive" } },
      { organization: { name: { contains: q, mode: "insensitive" } } },
      { organization: { code: { contains: q, mode: "insensitive" } } },
    ];
  }

  const requests = await prisma.purchaseRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true, number: true, title: true, status: true, priority: true,
      vendorName: true, totalEstimated: true, neededBy: true,
      submittedAt: true, createdAt: true, advisorEmail: true,
      organization: { select: { name: true, code: true } },
      submittedBy: { select: { name: true, email: true } },
      budget: { select: { name: true, costCenter: true, projectNumber: true } },
      approvals: { select: { status: true, emailSentAt: true } },
    },
  });

  return { count: requests.length, requests };
}

// ── Get request by ID or number (case-insensitive number match) ──────────────

async function getRequest(input: Record<string, string>, ctx: Ctx) {
  const id = input.id;

  // Try exact ID first
  let request = await prisma.purchaseRequest.findFirst({
    where: { OR: [{ id }, { number: id }] },
    include: {
      organization: { select: { name: true, code: true } },
      submittedBy: { select: { name: true, email: true } },
      assignedTo: { select: { name: true, email: true } },
      budget: { select: { name: true, costCenter: true, projectNumber: true, fiscalYear: true, allocated: true, spent: true } },
      items: true,
      approvals: { select: { status: true, approverEmail: true, emailSentAt: true, responseReceivedAt: true } },
    },
  });

  // If not found and input looks like a partial number, try DB-level fuzzy match
  if (!request && /^\d+$/.test(id)) {
    const fuzzyWhere: any = {
      number: { contains: id, mode: "insensitive" },
    };
    if (ctx.isAdmin) fuzzyWhere.organization = { tenantId: ctx.tenantId };
    else if (!ctx.isOrgLead) fuzzyWhere.submittedById = ctx.userId;

    const match = await prisma.purchaseRequest.findFirst({
      where: fuzzyWhere,
      select: { id: true, number: true },
      orderBy: { createdAt: "desc" },
    });
    if (match) {
      request = await prisma.purchaseRequest.findUnique({
        where: { id: match.id },
        include: {
          organization: { select: { name: true, code: true } },
          submittedBy: { select: { name: true, email: true } },
          assignedTo: { select: { name: true, email: true } },
          budget: { select: { name: true, costCenter: true, projectNumber: true, fiscalYear: true, allocated: true, spent: true } },
          items: true,
          approvals: { select: { status: true, approverEmail: true, emailSentAt: true, responseReceivedAt: true } },
        },
      });
    }
  }

  if (!request) return { error: "Request not found" };

  // Check access
  if (!ctx.isAdmin) {
    if (ctx.isOrgLead) {
      const isMember = await prisma.organizationMember.findFirst({
        where: { userId: ctx.userId, organizationId: request.organizationId },
      });
      if (!isMember) return { error: "Access denied" };
    } else if (request.submittedById !== ctx.userId) {
      return { error: "Access denied" };
    }
  }

  // Include recent audit log entries for context on status changes
  const auditLog = await prisma.auditLog.findMany({
    where: { requestId: request.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { action: true, details: true, createdAt: true },
  });

  return { ...request, auditLog };
}

// ── Status update ────────────────────────────────────────────────────────────

async function updateRequestStatus(input: Record<string, string>, ctx: Ctx) {
  const request = await prisma.purchaseRequest.findUnique({ where: { id: input.requestId } });
  if (!request) return { error: "Request not found" };

  if (!ctx.isAdmin && ["SUBMITTED", "PENDING_APPROVAL"].includes(request.status) && input.status === "APPROVED") {
    return { error: "Only admins can manually approve. Use send_approval_email to request advisor approval." };
  }

  await prisma.purchaseRequest.update({
    where: { id: input.requestId },
    data: { status: input.status },
  });

  await prisma.auditLog.create({
    data: {
      requestId: input.requestId,
      userId: ctx.userId,
      action: "STATUS_CHANGE",
      details: `${request.status} → ${input.status}${input.note ? `. ${input.note}` : ""} (via AI assistant)`,
    },
  });

  return { ok: true, previousStatus: request.status, newStatus: input.status };
}

// ── Send approval email ──────────────────────────────────────────────────────

async function sendApprovalEmailTool(input: Record<string, string>, ctx: Ctx) {
  const request = await prisma.purchaseRequest.findUnique({
    where: { id: input.requestId },
    include: { approvals: true, organization: true, items: true, submittedBy: true },
  });

  if (!request) return { error: "Request not found" };
  if (!request.advisorEmail) return { error: "No advisor email on this request — add one first." };

  const existingPending = request.approvals.find((a) => a.status === "PENDING");
  const token = randomUUID();

  // Build the email first, only persist token after successful send
  const appUrl = `${ctx.proto}://${ctx.host}`;
  const approveUrl = `${appUrl}/api/email/decision?token=${token}&action=approve`;
  const declineUrl = `${appUrl}/api/email/decision?token=${token}&action=decline`;
  const advisorName = request.advisorName || request.advisorEmail;
  const studentName = request.submittedBy?.name || request.submittedBy?.email || "a student";
  const total = request.totalEstimated ? `$${request.totalEstimated.toFixed(2)}` : "TBD";

  const itemRows = request.items.map((i) => {
    const price = i.unitPrice != null ? `$${i.unitPrice.toFixed(2)}` : "—";
    const lineTotal = i.unitPrice != null ? `$${(i.unitPrice * i.quantity).toFixed(2)}` : "—";
    return `<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb">${i.name}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center">${i.quantity}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right">${price}</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right">${lineTotal}</td></tr>`;
  }).join("");

  const bodyHtml = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1)">
<tr><td style="background:#1e3a5f;padding:24px 32px"><p style="margin:0;color:#fff;font-size:20px;font-weight:700">Stamped</p><p style="margin:4px 0 0;color:#93c5fd;font-size:13px">Purchase Request Approval</p></td></tr>
<tr><td style="padding:32px">
<p style="margin:0 0 20px;font-size:15px;color:#374151">Dear ${advisorName},</p>
<p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6"><strong>${studentName}</strong> has submitted a purchase request on behalf of <strong>${request.organization?.name}</strong> that requires your approval.</p>
<table width="100%" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:24px"><tr><td style="padding:16px 20px"><p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;font-weight:600">Request</p><p style="margin:4px 0 0;font-size:15px;color:#111827;font-weight:600">${request.number} — ${request.title}</p></td></tr><tr><td style="padding:12px 20px"><p style="margin:0;font-size:13px;color:#6b7280">Estimated total: <span style="color:#374151;font-weight:600">${total}</span></p></td></tr></table>
${request.items.length > 0 ? `<table width="100%" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;font-size:13px;color:#374151"><thead><tr style="background:#f3f4f6"><th style="padding:8px 12px;text-align:left;font-weight:600;color:#6b7280;font-size:11px;text-transform:uppercase">Item</th><th style="padding:8px 12px;text-align:center;font-weight:600;color:#6b7280;font-size:11px;text-transform:uppercase">Qty</th><th style="padding:8px 12px;text-align:right;font-weight:600;color:#6b7280;font-size:11px;text-transform:uppercase">Unit</th><th style="padding:8px 12px;text-align:right;font-weight:600;color:#6b7280;font-size:11px;text-transform:uppercase">Total</th></tr></thead><tbody>${itemRows}</tbody></table>` : ""}
<p style="margin:0 0 16px;font-size:14px;color:#374151;font-weight:500">Please click one of the buttons below:</p>
<table cellpadding="0" cellspacing="0"><tr><td style="padding-right:12px"><a href="${approveUrl}" style="display:inline-block;background:#16a34a;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px">✓ Approve</a></td><td><a href="${declineUrl}" style="display:inline-block;background:#dc2626;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px">✗ Decline</a></td></tr></table>
</td></tr>
<tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center"><p style="margin:0;font-size:12px;color:#9ca3af">Stamped · Purchase Management Portal</p></td></tr>
</table></td></tr></table></body></html>`;

  const bodyText = `Hi ${advisorName},\n\n${studentName} submitted a purchase request (${request.number} — ${request.title}) for ${request.organization?.name}.\n\nTotal: ${total}\n\nAPPROVE: ${approveUrl}\nDECLINE: ${declineUrl}`;

  const result = await sendEmail({
    to: request.advisorEmail,
    subject: `[Action Required] Approve Purchase Request ${request.number} — ${request.title}`,
    bodyHtml,
    bodyText,
  });

  if (!result.sent) {
    return { sent: false, message: `No email provider configured (SMTP or Graph). Email was NOT sent. Set SMTP_HOST/SMTP_USER/SMTP_PASS or MS_EMAIL_ADDRESS on Render to enable email.` };
  }

  // Email sent successfully — now persist the token and update status
  if (existingPending) {
    await prisma.approval.update({
      where: { id: existingPending.id },
      data: { approvalToken: token, emailSentAt: new Date() },
    });
  } else {
    await prisma.approval.create({
      data: {
        requestId: input.requestId,
        approverEmail: request.advisorEmail,
        approverName: request.advisorName,
        status: "PENDING",
        emailSentAt: new Date(),
        approvalToken: token,
      },
    });
  }

  if (request.status === "SUBMITTED") {
    await prisma.purchaseRequest.update({
      where: { id: input.requestId },
      data: { status: "PENDING_APPROVAL" },
    });
  }

  await prisma.auditLog.create({
    data: {
      requestId: input.requestId,
      userId: ctx.userId,
      action: "EMAIL_SENT",
      details: `Approval email sent to ${request.advisorEmail} via ${result.via} (AI assistant)`,
    },
  });

  return { sent: true, message: `Approval email sent to ${request.advisorEmail} via ${result.via}.` };
}

// ── Organizations ────────────────────────────────────────────────────────────

async function listOrganizations(ctx: Ctx) {
  if (ctx.isAdmin) {
    return prisma.organization.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      select: { id: true, name: true, code: true, department: true },
      orderBy: { name: "asc" },
    });
  }
  const memberships = await prisma.organizationMember.findMany({
    where: { userId: ctx.userId },
    include: { organization: { select: { id: true, name: true, code: true, department: true } } },
  });
  return memberships.map((m) => m.organization);
}

// ── Budgets ──────────────────────────────────────────────────────────────────

async function getBudgets(input: Record<string, string>, ctx: Ctx) {
  const where: any = {};
  if (input.organizationId) where.organizationId = input.organizationId;
  if (!ctx.isAdmin) {
    const memberships = await prisma.organizationMember.findMany({
      where: { userId: ctx.userId },
      select: { organizationId: true },
    });
    where.organizationId = { in: memberships.map((m) => m.organizationId) };
  }
  return prisma.budget.findMany({
    where,
    select: {
      id: true, name: true, fiscalYear: true, allocated: true, spent: true, reserved: true,
      costCenter: true, projectNumber: true,
      organization: { select: { name: true, code: true } },
    },
    orderBy: { fiscalYear: "desc" },
    take: 20,
  });
}
