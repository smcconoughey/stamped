import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { anthropic } from "@/lib/claude";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
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

Current user: ${user.name || user.email} (${role})
${context ? `Page: ${context}` : ""}

Rules:
- Keep answers to 1-3 short sentences. No bullet lists unless asked.
- Use the tools to look up real data before answering questions about requests, budgets, or orgs.
- When the user asks to do something (resend email, change status), just do it and confirm briefly.
- Never say "I don't have access" — you DO have access. Use the tools.
- Use natural language for statuses: "pending approval" not "PENDING_APPROVAL".`;

  const tools: any[] = [
    {
      name: "search_requests",
      description: "Search purchase requests. Returns up to 10 results. Use to find requests by keyword, status, vendor, etc.",
      input_schema: {
        type: "object" as const,
        properties: {
          query: { type: "string", description: "Search term — matches title, number, vendor name, or description" },
          status: { type: "string", description: "Filter by status: DRAFT, SUBMITTED, PENDING_APPROVAL, APPROVED, ORDERED, RECEIVED, READY_FOR_PICKUP, PICKED_UP, CANCELLED, REJECTED, ON_HOLD" },
        },
        required: [],
      },
    },
    {
      name: "get_request",
      description: "Get full details of a specific purchase request by ID or request number.",
      input_schema: {
        type: "object" as const,
        properties: {
          id: { type: "string", description: "Request ID (cuid) or request number (e.g. ERPL-2026-001)" },
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
      description: "Send or resend an advisor approval email for a purchase request.",
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

  // Build Claude messages
  const claudeMessages: any[] = messages.map((m: { role: string; content: string }) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Tool execution loop (max 5 iterations)
  let finalText = "Sorry, something went wrong.";
  for (let i = 0; i < 5; i++) {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system: systemPrompt,
      tools,
      messages: claudeMessages,
    });

    // Collect any text
    const textBlock = response.content.find((b: any) => b.type === "text");
    if (textBlock?.type === "text") {
      finalText = textBlock.text;
    }

    // If no tool use, we're done
    const toolUses = response.content.filter((b: any) => b.type === "tool_use");
    if (toolUses.length === 0) {
      break;
    }

    // Execute tools and add results
    claudeMessages.push({ role: "assistant", content: response.content });

    const toolResults: any[] = [];
    for (const tu of toolUses) {
      if (tu.type !== "tool_use") continue;
      const result = await executeTool(tu.name, tu.input as Record<string, string>, {
        userId, tenantId, role, isAdmin, isOrgLead,
        host: req.headers.get("host") || "",
        proto: req.headers.get("host")?.startsWith("localhost") ? "http" : "https",
      });
      toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(result) });
    }

    claudeMessages.push({ role: "user", content: toolResults });
  }

  return NextResponse.json({ reply: finalText });
}

// ── Tool implementations ────────────────────────────────────────────────────

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
  switch (name) {
    case "search_requests":
      return searchRequests(input, ctx);
    case "get_request":
      return getRequest(input, ctx);
    case "update_request_status":
      return updateRequestStatus(input, ctx);
    case "send_approval_email":
      return sendApprovalEmail(input, ctx);
    case "list_organizations":
      return listOrganizations(ctx);
    case "get_budgets":
      return getBudgets(input, ctx);
    default:
      return { error: "Unknown tool" };
  }
}

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
    // Admin scoped to tenant
    where.organization = { tenantId: ctx.tenantId };
  }

  if (input.status) where.status = input.status;
  if (input.query) {
    where.OR = [
      { title: { contains: input.query } },
      { number: { contains: input.query } },
      { vendorName: { contains: input.query } },
      { description: { contains: input.query } },
    ];
  }

  const requests = await prisma.purchaseRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 10,
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

async function getRequest(input: Record<string, string>, ctx: Ctx) {
  const id = input.id;
  const request = await prisma.purchaseRequest.findFirst({
    where: {
      OR: [{ id }, { number: id }],
    },
    include: {
      organization: { select: { name: true, code: true } },
      submittedBy: { select: { name: true, email: true } },
      assignedTo: { select: { name: true, email: true } },
      budget: { select: { name: true, costCenter: true, projectNumber: true, fiscalYear: true, allocated: true, spent: true } },
      items: true,
      approvals: { select: { status: true, approverEmail: true, emailSentAt: true, responseReceivedAt: true } },
    },
  });

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

  return request;
}

async function updateRequestStatus(input: Record<string, string>, ctx: Ctx) {
  const request = await prisma.purchaseRequest.findUnique({ where: { id: input.requestId } });
  if (!request) return { error: "Request not found" };

  // Non-admins can't force approve during approval phase
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

async function sendApprovalEmail(input: Record<string, string>, ctx: Ctx) {
  const requestId = input.requestId;
  const request = await prisma.purchaseRequest.findUnique({
    where: { id: requestId },
    include: { approvals: true, organization: true, items: true },
  });

  if (!request) return { error: "Request not found" };
  if (!request.advisorEmail) return { error: "No advisor email on this request" };

  // Find or create pending approval
  const existingPending = request.approvals.find((a) => a.status === "PENDING");
  const token = randomUUID();

  if (existingPending) {
    await prisma.approval.update({
      where: { id: existingPending.id },
      data: { approvalToken: token, emailSentAt: new Date() },
    });
  } else {
    await prisma.approval.create({
      data: {
        requestId,
        approverEmail: request.advisorEmail,
        approverName: request.advisorName,
        status: "PENDING",
        emailSentAt: new Date(),
        approvalToken: token,
      },
    });
  }

  // Update status to PENDING_APPROVAL if still SUBMITTED
  if (request.status === "SUBMITTED") {
    await prisma.purchaseRequest.update({
      where: { id: requestId },
      data: { status: "PENDING_APPROVAL" },
    });
  }

  // Try sending the email via the sendEmail utility
  try {
    const { sendEmail } = await import("@/lib/mailer");
    const appUrl = `${ctx.proto}://${ctx.host}`;
    const approveUrl = `${appUrl}/api/email/decision?token=${token}&action=approve`;
    const declineUrl = `${appUrl}/api/email/decision?token=${token}&action=decline`;

    const itemsHtml = request.items.map((item) =>
      `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">${item.name}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">${item.quantity}</td><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">$${(item.totalPrice ?? 0).toFixed(2)}</td></tr>`
    ).join("");

    const html = `<div style="font-family:sans-serif;max-width:560px;margin:0 auto">
      <h2 style="color:#1e3a5f">Purchase Approval Request</h2>
      <p><strong>${request.number}</strong> — ${request.title}</p>
      <p>Organization: ${request.organization?.name ?? "Unknown"}</p>
      <p>Justification: ${request.justification}</p>
      ${request.items.length > 0 ? `<table style="width:100%;border-collapse:collapse;margin:16px 0"><thead><tr style="background:#f9fafb"><th style="padding:6px 12px;text-align:left">Item</th><th style="padding:6px 12px;text-align:left">Qty</th><th style="padding:6px 12px;text-align:left">Total</th></tr></thead><tbody>${itemsHtml}</tbody></table>` : ""}
      <div style="margin:24px 0">
        <a href="${approveUrl}" style="display:inline-block;padding:12px 28px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;margin-right:12px">Approve</a>
        <a href="${declineUrl}" style="display:inline-block;padding:12px 28px;background:#dc2626;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Decline</a>
      </div>
    </div>`;

    const result = await sendEmail({
      to: request.advisorEmail,
      subject: `Approval needed: ${request.number} — ${request.title}`,
      bodyHtml: html,
      bodyText: `Approval needed for ${request.number} — ${request.title}. Please use the link in the HTML version of this email.`,
    });

    if (result.sent) {
      return { ok: true, message: "Approval email sent" };
    }
    return { ok: true, message: "Email configured as draft — no SMTP/Graph set up. Approval token created." };
  } catch {
    return { ok: true, message: "Approval token created but email sending failed. Advisor can still use the link if shared manually." };
  }
}

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
