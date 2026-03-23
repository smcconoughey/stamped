/**
 * SMTP email sender using Nodemailer.
 *
 * Works with any SMTP provider — no Azure AD admin consent required.
 *
 * Recommended options (all free):
 *
 *   Gmail (personal or Workspace):
 *     SMTP_HOST=smtp.gmail.com  SMTP_PORT=587
 *     SMTP_USER=you@gmail.com   SMTP_PASS=<App Password>
 *     To generate an App Password: myaccount.google.com → Security → App passwords
 *     (Requires 2-Step Verification to be enabled first)
 *
 *   Outlook.com / personal Microsoft account:
 *     SMTP_HOST=smtp-mail.outlook.com  SMTP_PORT=587
 *     SMTP_USER=you@outlook.com        SMTP_PASS=<your password>
 *
 *   Any other provider (SendGrid, Mailgun, Postmark, etc.) also works via SMTP.
 */

import nodemailer from "nodemailer";

export const smtpConfigured =
  !!process.env.SMTP_HOST &&
  !!process.env.SMTP_USER &&
  !!process.env.SMTP_PASS;

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? "587"),
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export interface SmtpSendParams {
  to: string;
  subject: string;
  bodyHtml: string;
  replyTo?: string;
}

export async function sendMailSmtp(params: SmtpSendParams): Promise<void> {
  const fromName = process.env.SMTP_FROM_NAME ?? process.env.APP_NAME ?? "Stamped";
  const fromAddress = process.env.SMTP_FROM ?? process.env.SMTP_USER!;

  const transport = createTransport();
  await transport.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to: params.to,
    subject: params.subject,
    html: params.bodyHtml,
    replyTo: params.replyTo ?? fromAddress,
  });
}
