/**
 * GET  /api/email/decision?token=xxx&action=approve|decline
 *
 * Public (no auth) endpoint embedded in approval emails.
 * The advisor clicks the Approve or Decline button and lands here.
 *
 * To prevent email link scanners (Microsoft Safe Links, etc.) from
 * accidentally triggering a decision, this now shows a confirmation
 * page. The actual state change happens when the advisor clicks
 * the confirm button (POST).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ── GET — show confirmation page (no side effects) ──────────────────────────

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const action = req.nextUrl.searchParams.get("action"); // "approve" | "decline"

  if (!token || !["approve", "decline"].includes(action ?? "")) {
    return htmlPage("Invalid Link", "This link is missing required parameters.", "red");
  }

  const approval = await prisma.approval.findUnique({
    where: { approvalToken: token },
    include: { request: { include: { organization: true } } },
  });

  if (!approval) {
    return htmlPage("Link Not Found", "This approval link is invalid or has already been used.", "red");
  }

  if (approval.status !== "PENDING") {
    const past = approval.status === "APPROVED" ? "approved" : "declined";
    return htmlPage(
      "Already Responded",
      `This request was already ${past}. No changes have been made.`,
      "gray",
    );
  }

  const req_ = approval.request;
  const label = action === "approve" ? "Approve" : "Decline";
  const btnColor = action === "approve" ? "#16a34a" : "#dc2626";

  // Show a confirmation page — the actual decision is triggered by the form POST
  return new NextResponse(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirm ${label}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f3f4f6; margin: 0; padding: 40px 16px; }
    .card { max-width: 480px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 36px 32px; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    h1 { color: #111827; font-size: 22px; margin: 0 0 8px; }
    .meta { color: #6b7280; font-size: 14px; margin: 0 0 24px; line-height: 1.6; }
    .meta strong { color: #374151; }
    .btn { display: inline-block; background: ${btnColor}; color: #fff; font-size: 16px; font-weight: 600; text-decoration: none; padding: 12px 32px; border-radius: 8px; border: none; cursor: pointer; }
    .btn:hover { opacity: 0.9; }
    .cancel { display: inline-block; margin-left: 12px; color: #6b7280; font-size: 14px; text-decoration: none; }
    .cancel:hover { color: #374151; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Confirm: ${label} Request</h1>
    <p class="meta">
      <strong>${req_.number}</strong> — ${req_.title}<br/>
      Organization: ${req_.organization?.name ?? "Unknown"}
    </p>
    <form method="POST" action="/api/email/decision">
      <input type="hidden" name="token" value="${token}" />
      <input type="hidden" name="action" value="${action}" />
      <button type="submit" class="btn">${label} this request</button>
    </form>
  </div>
</body>
</html>`,
    { status: 200, headers: { "Content-Type": "text/html" } },
  );
}

// ── POST — actually execute the decision ────────────────────────────────────

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const token = formData.get("token") as string | null;
  const action = formData.get("action") as string | null;

  if (!token || !["approve", "decline"].includes(action ?? "")) {
    return htmlPage("Invalid Request", "Missing required parameters.", "red");
  }

  const approval = await prisma.approval.findUnique({
    where: { approvalToken: token },
    include: { request: { include: { organization: true } } },
  });

  if (!approval) {
    return htmlPage("Link Not Found", "This approval link is invalid or has already been used.", "red");
  }

  if (approval.status !== "PENDING") {
    const past = approval.status === "APPROVED" ? "approved" : "declined";
    return htmlPage(
      "Already Responded",
      `This request was already ${past}. No changes have been made.`,
      "gray",
    );
  }

  const decision = action === "approve" ? "APPROVED" : "REJECTED";
  const requestStatus = action === "approve" ? "APPROVED" : "REJECTED";

  await prisma.$transaction([
    prisma.approval.update({
      where: { id: approval.id },
      data: {
        status: decision,
        responseReceivedAt: new Date(),
        aiParsedDecision: decision,
        aiConfidence: 1.0,
        approvalToken: null, // invalidate token after use
      },
    }),
    prisma.purchaseRequest.update({
      where: { id: approval.requestId },
      data: { status: requestStatus },
    }),
    prisma.auditLog.create({
      data: {
        requestId: approval.requestId,
        action: `APPROVAL_${decision}`,
        details: `Advisor ${approval.approverEmail} ${action}d via email link`,
      },
    }),
  ]);

  const req_ = approval.request;

  if (action === "approve") {
    return htmlPage(
      "Request Approved",
      `You have approved purchase request <strong>${req_.number} — ${req_.title}</strong> for ${req_.organization?.name ?? "the organization"}. The purchasing team has been notified.`,
      "green",
    );
  } else {
    return htmlPage(
      "Request Declined",
      `You have declined purchase request <strong>${req_.number} — ${req_.title}</strong>. The purchasing team has been notified.`,
      "orange",
    );
  }
}

// ── HTML template ───────────────────────────────────────────────────────────

function htmlPage(heading: string, body: string, color: "green" | "red" | "orange" | "gray") {
  const colors = {
    green:  { bg: "#f0fdf4", border: "#16a34a", heading: "#15803d" },
    red:    { bg: "#fef2f2", border: "#dc2626", heading: "#b91c1c" },
    orange: { bg: "#fff7ed", border: "#ea580c", heading: "#c2410c" },
    gray:   { bg: "#f9fafb", border: "#6b7280", heading: "#374151" },
  }[color];

  return new NextResponse(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${heading}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f3f4f6; margin: 0; padding: 40px 16px; }
    .card { max-width: 480px; margin: 0 auto; background: ${colors.bg}; border: 2px solid ${colors.border}; border-radius: 12px; padding: 36px 32px; }
    h1 { color: ${colors.heading}; font-size: 22px; margin: 0 0 12px; }
    p { color: #374151; font-size: 15px; line-height: 1.6; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${heading}</h1>
    <p>${body}</p>
  </div>
</body>
</html>`,
    { status: 200, headers: { "Content-Type": "text/html" } },
  );
}
