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
import { randomUUID } from "crypto";

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

  // Any authenticated user can send/resend (students, org leads, admins)
  const existingPending = request.approvals.find((a) => a.status === "PENDING");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const token = randomUUID();
  const approveUrl = `${appUrl}/api/email/decision?token=${token}&action=approve`;
  const declineUrl = `${appUrl}/api/email/decision?token=${token}&action=decline`;

  const totalEstimated = request.totalEstimated
    ? `$${request.totalEstimated.toFixed(2)}`
    : "TBD";

  const itemRows = request.items
    .map((i) => {
      const price = i.unitPrice != null ? `$${i.unitPrice.toFixed(2)}` : "—";
      const total =
        i.unitPrice != null ? `$${(i.unitPrice * i.quantity).toFixed(2)}` : "—";
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${i.name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${i.quantity}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${price}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${total}</td>
        </tr>`;
    })
    .join("");

  const advisorName = request.advisorName || request.advisorEmail || "Advisor";
  const studentName = request.submittedBy.name ?? request.submittedBy.email ?? "a student";
  const orgName = request.organization.name;
  const justification = request.justification ?? "No justification provided.";

  const bodyHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Purchase Request Approval</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">

        <!-- Header -->
        <tr>
          <td style="background:#1e3a5f;padding:24px 32px;">
            <p style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">Stamped</p>
            <p style="margin:4px 0 0;color:#93c5fd;font-size:13px;">Purchase Request Approval</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            <p style="margin:0 0 20px;font-size:15px;color:#374151;">Dear ${advisorName},</p>
            <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
              <strong>${studentName}</strong> has submitted a purchase request on behalf of
              <strong>${orgName}</strong> that requires your approval.
            </p>

            <!-- Request details box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:24px;">
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
                  <p style="margin:0;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;font-weight:600;">Request</p>
                  <p style="margin:4px 0 0;font-size:15px;color:#111827;font-weight:600;">${request.number} — ${request.title}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 20px;border-bottom:1px solid #e5e7eb;">
                  <p style="margin:0;font-size:13px;color:#6b7280;">Organization: <span style="color:#374151;font-weight:500;">${orgName}</span></p>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 20px;border-bottom:1px solid #e5e7eb;">
                  <p style="margin:0;font-size:13px;color:#6b7280;">Submitted by: <span style="color:#374151;font-weight:500;">${studentName}</span></p>
                </td>
              </tr>
              <tr>
                <td style="padding:12px 20px;">
                  <p style="margin:0;font-size:13px;color:#6b7280;">Estimated total: <span style="color:#374151;font-weight:600;">${totalEstimated}</span></p>
                </td>
              </tr>
            </table>

            <!-- Items table -->
            <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.4px;">Items Requested</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;font-size:13px;color:#374151;">
              <thead>
                <tr style="background:#f3f4f6;">
                  <th style="padding:8px 12px;text-align:left;font-weight:600;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.4px;">Item</th>
                  <th style="padding:8px 12px;text-align:center;font-weight:600;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.4px;">Qty</th>
                  <th style="padding:8px 12px;text-align:right;font-weight:600;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.4px;">Unit Price</th>
                  <th style="padding:8px 12px;text-align:right;font-weight:600;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.4px;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemRows || `<tr><td colspan="4" style="padding:12px;color:#9ca3af;text-align:center;">No items listed</td></tr>`}
              </tbody>
            </table>

            <!-- Justification -->
            <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;text-transform:uppercase;letter-spacing:.4px;">Justification</p>
            <p style="margin:0 0 32px;font-size:14px;color:#374151;line-height:1.7;background:#f9fafb;border-left:3px solid #d1d5db;padding:12px 16px;border-radius:0 6px 6px 0;">${justification}</p>

            <!-- CTA buttons -->
            <p style="margin:0 0 16px;font-size:14px;color:#374151;font-weight:500;">Please click one of the buttons below to respond:</p>
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding-right:12px;">
                  <a href="${approveUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px;">
                    ✓ Approve
                  </a>
                </td>
                <td>
                  <a href="${declineUrl}" style="display:inline-block;background:#dc2626;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px;">
                    ✗ Decline
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;line-height:1.6;">
              You can only respond once. If you have questions, reply to this email directly.<br/>
              This request was submitted through the Stamped purchasing portal.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">Stamped · Purchase Management Portal</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const bodyText = `Hi ${advisorName},

${studentName} has submitted a purchase request for ${orgName} that needs your approval.

Request: ${request.number} — ${request.title}
Estimated Total: ${totalEstimated}

Items:
${request.items.map((i) => `  - ${i.name} (qty: ${i.quantity}${i.unitPrice != null ? `, $${i.unitPrice.toFixed(2)} each` : ""})`).join("\n")}

Justification:
${justification}

APPROVE: ${approveUrl}
DECLINE: ${declineUrl}

You can only respond once. If you have questions, reply to this email.

— Stamped Purchasing Portal`;

  const subject = `[Action Required] Approve Purchase Request ${request.number} — ${request.title}`;

  try {
    const result = await sendEmail({ to: request.advisorEmail!, subject, bodyHtml, bodyText });

    if (!result.sent) {
      // Return draft — but still include the approve/decline URLs so admin can forward manually
      return NextResponse.json({
        mode: "draft",
        to: request.advisorEmail,
        subject,
        body: bodyText,
        bodyHtml,
        approveUrl,
        declineUrl,
        note: "No email provider configured. Set SMTP_HOST/SMTP_USER/SMTP_PASS or MS_EMAIL_ADDRESS + Azure AD credentials.",
      });
    }

    const messageId = result.via === "graph" ? (result.messageId ?? "") : "";

    const approval = existingPending
      ? await prisma.approval.update({
          where: { id: existingPending.id },
          data: { emailSentAt: new Date(), emailMessageId: messageId, status: "PENDING", approvalToken: token },
        })
      : await prisma.approval.create({
          data: {
            requestId: request.id,
            approverEmail: request.advisorEmail!,
            approverName: request.advisorName,
            status: "PENDING",
            emailSentAt: new Date(),
            emailMessageId: messageId,
            approvalToken: token,
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
