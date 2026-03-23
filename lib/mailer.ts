/**
 * Unified email sender.
 *
 * Priority order:
 *   1. SMTP  — if SMTP_HOST + SMTP_USER + SMTP_PASS are set (no admin consent needed)
 *   2. Graph — if MS_EMAIL_ADDRESS + Azure AD / MS_* credentials are set
 *   3. Draft — returns the email body without sending (dev/unconfigured mode)
 *
 * For most deployments without IT support, SMTP is the easiest option.
 */

import { sendMailSmtp, smtpConfigured } from "./smtp";
import { sendMail as sendMailGraph, graphConfigured } from "./graph";

export type MailResult =
  | { sent: true; via: "smtp" | "graph"; messageId?: string }
  | { sent: false; via: "draft"; body: string; to: string; subject: string };

export async function sendEmail(params: {
  to: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
}): Promise<MailResult> {
  const replyTo = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? process.env.MS_EMAIL_ADDRESS;

  if (smtpConfigured) {
    await sendMailSmtp({
      to: params.to,
      subject: params.subject,
      bodyHtml: params.bodyHtml,
      replyTo,
    });
    return { sent: true, via: "smtp" };
  }

  if (graphConfigured) {
    const { messageId } = await sendMailGraph({
      to: params.to,
      subject: params.subject,
      bodyHtml: params.bodyHtml,
      replyTo,
    });
    return { sent: true, via: "graph", messageId };
  }

  // No email configured — return draft
  return { sent: false, via: "draft", body: params.bodyText, to: params.to, subject: params.subject };
}
