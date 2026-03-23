/**
 * POST /api/email/send-approval
 * Sends an advisor approval email for a purchase request.
 * Called automatically when a request moves to SUBMITTED status,
 * or manually triggered by an admin.
 *
 * Body: { requestId: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/mailer";
import { generateApprovalEmailDraft } from "@/lib/claude";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { requestId } = await req.json();
  if (!requestId) return NextResponse.json({ error: "requestId required" }, { status: 400 });

  const request = await prisma.purchaseRequest.findUnique({
    where: { id: requestId },
    include: {
      submittedBy: true,
      organization: true,
      items: true,
      approvals: true,
    },
  });

  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only ADMIN_STAFF, FINANCE_ADMIN, SUPER_ADMIN can trigger sends
  const role = (session.user as any).role;
  if (!["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Don't re-send if already pending
  const existingPending = request.approvals.find((a) => a.status === "PENDING");
  if (existingPending?.emailSentAt) {
    return NextResponse.json({
      error: "Approval email already sent",
      sentAt: existingPending.emailSentAt,
    }, { status: 409 });
  }

  const totalEstimated = request.totalEstimated
    ? `$${request.totalEstimated.toFixed(2)}`
    : "TBD";

  const emailBody = await generateApprovalEmailDraft({
    advisorName: request.advisorName ?? request.advisorEmail,
    advisorEmail: request.advisorEmail,
    requestNumber: request.number,
    requestTitle: request.title,
    orgName: request.organization.name,
    studentName: request.submittedBy.name ?? request.submittedBy.email,
    justification: request.justification,
    totalEstimated,
    items: request.items.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice?.toFixed(2),
    })),
  });

  const subject = `[Stamped] Approval Request: ${request.number} — ${request.title}`;
  const bodyHtml = `<pre style="font-family: sans-serif; white-space: pre-wrap;">${emailBody}</pre>`;

  try {
    const result = await sendEmail({
      to: request.advisorEmail,
      subject,
      bodyHtml,
      bodyText: emailBody,
    });

    if (!result.sent) {
      // No email backend configured — return draft for manual sending
      return NextResponse.json({
        mode: "draft",
        to: request.advisorEmail,
        subject,
        body: emailBody,
        note: "No email provider configured. Set SMTP_HOST/SMTP_USER/SMTP_PASS (easiest) or MS_EMAIL_ADDRESS + Azure AD credentials.",
      });
    }

    const messageId = result.via === "graph" ? result.messageId ?? "" : "";

    const approval = existingPending
      ? await prisma.approval.update({
          where: { id: existingPending.id },
          data: { emailSentAt: new Date(), emailMessageId: messageId, status: "PENDING" },
        })
      : await prisma.approval.create({
          data: {
            requestId: request.id,
            approverEmail: request.advisorEmail,
            approverName: request.advisorName,
            status: "PENDING",
            emailSentAt: new Date(),
            emailMessageId: messageId,
          },
        });

    if (request.status === "SUBMITTED") {
      await prisma.purchaseRequest.update({
        where: { id: request.id },
        data: { status: "PENDING_APPROVAL" },
      });
    }

    await prisma.auditLog.create({
      data: {
        requestId: request.id,
        userId: (session.user as any).id,
        action: "EMAIL_SENT",
        details: `Approval email sent to ${request.advisorEmail} via ${result.via}${messageId ? ` (msgId: ${messageId})` : ""}`,
      },
    });

    return NextResponse.json({ success: true, approvalId: approval.id, messageId, via: result.via });
  } catch (err: any) {
    console.error("send-approval error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
