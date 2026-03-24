/**
 * GET /api/email/decision?token=xxx&action=approve|decline
 *
 * Public (no auth) one-click endpoint embedded in approval emails.
 * The advisor clicks the Approve or Decline button and lands here.
 * Updates the Approval and PurchaseRequest status, then returns a
 * simple HTML confirmation page.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const action = req.nextUrl.searchParams.get("action"); // "approve" | "decline"

  if (!token || !["approve", "decline"].includes(action ?? "")) {
    return html("Invalid Link", "This link is missing required parameters.", "red");
  }

  const approval = await prisma.approval.findUnique({
    where: { approvalToken: token },
    include: { request: { include: { organization: true } } },
  });

  if (!approval) {
    return html("Link Not Found", "This approval link is invalid or has already been used.", "red");
  }

  if (approval.status !== "PENDING") {
    const past = approval.status === "APPROVED" ? "approved" : "declined";
    return html(
      "Already Responded",
      `This request was already ${past}. No changes have been made.`,
      "gray"
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
  const title = req_.title;
  const number = req_.number;

  if (action === "approve") {
    return html(
      "Request Approved",
      `You have approved purchase request <strong>${number} — ${title}</strong> for ${req_.organization?.name ?? "the organization"}. The purchasing team has been notified.`,
      "green"
    );
  } else {
    return html(
      "Request Declined",
      `You have declined purchase request <strong>${number} — ${title}</strong>. The purchasing team has been notified.`,
      "orange"
    );
  }
}

function html(heading: string, body: string, color: "green" | "red" | "orange" | "gray") {
  const colors = {
    green: { bg: "#f0fdf4", border: "#16a34a", heading: "#15803d" },
    red: { bg: "#fef2f2", border: "#dc2626", heading: "#b91c1c" },
    orange: { bg: "#fff7ed", border: "#ea580c", heading: "#c2410c" },
    gray: { bg: "#f9fafb", border: "#6b7280", heading: "#374151" },
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
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}
