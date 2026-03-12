/**
 * POST /api/email/poll
 * Polls the purchasing mailbox for unread reply emails, runs Claude on each,
 * and auto-advances request status based on the parsed decision.
 *
 * Called by:
 *   - A Render cron job (every 5–15 minutes)
 *   - Manually from the admin UI
 *
 * Returns a summary of what was processed.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchUnreadMessages, markAsRead, moveToProcessed, graphConfigured } from "@/lib/graph";
import { parseApprovalEmail } from "@/lib/claude";

// Map Claude's decision to an Approval status
const decisionToStatus: Record<string, string> = {
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  NEEDS_INFO: "NEEDS_INFO",
  UNCLEAR: "PENDING", // don't change status for unclear replies
};

// When advisor approves, advance the request to APPROVED
const requestStatusOnApproval: Record<string, string> = {
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
};

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = (session.user as any).role;
  if (!["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!graphConfigured) {
    return NextResponse.json({
      error: "Microsoft Graph not configured.",
      hint: "Set MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, MS_EMAIL_ADDRESS in your environment.",
    }, { status: 503 });
  }

  const results: Array<{
    messageId: string;
    from: string;
    subject: string;
    matched: boolean;
    decision?: string;
    confidence?: number;
    requestNumber?: string;
    action?: string;
  }> = [];

  try {
    const messages = await fetchUnreadMessages();

    for (const msg of messages) {
      const result: (typeof results)[0] = {
        messageId: msg.id,
        from: msg.from,
        subject: msg.subject,
        matched: false,
      };

      // Try to match message to a pending approval via:
      // 1. In-Reply-To header matching emailMessageId stored in Approval
      // 2. Request number in subject line
      let approval = null;
      let request = null;

      if (msg.inReplyTo) {
        approval = await prisma.approval.findFirst({
          where: { emailMessageId: msg.inReplyTo },
          include: { request: { include: { items: true } } },
        });
      }

      // Fallback: scan subject for request number pattern (e.g. COE-2025-0001)
      if (!approval) {
        const numMatch = msg.subject.match(/[A-Z]{2,5}-\d{4}-\d{4}/);
        if (numMatch) {
          request = await prisma.purchaseRequest.findUnique({
            where: { number: numMatch[0] },
            include: { items: true },
          });
          if (request) {
            approval = await prisma.approval.findFirst({
              where: { requestId: request.id, status: "PENDING" },
              include: { request: { include: { items: true } } },
            });
          }
        }
      }

      if (!approval) {
        // Unknown email — still mark read so it doesn't keep showing up
        await markAsRead(msg.id);
        results.push({ ...result, action: "skipped_no_match" });
        continue;
      }

      result.matched = true;
      result.requestNumber = approval.request.number;
      request = approval.request;

      // Parse with Claude
      const parsed = await parseApprovalEmail(
        msg.bodyText,
        request.title,
        request.number
      );

      result.decision = parsed.decision;
      result.confidence = parsed.confidence;

      // Update the Approval record
      const newApprovalStatus = decisionToStatus[parsed.decision] ?? "PENDING";
      await prisma.approval.update({
        where: { id: approval.id },
        data: {
          status: newApprovalStatus,
          responseEmailId: msg.internetMessageId,
          responseReceivedAt: new Date(msg.receivedAt),
          responseRaw: msg.bodyText.slice(0, 4000),
          aiParsedDecision: parsed.decision,
          aiConfidence: parsed.confidence,
          notes: parsed.notes ?? parsed.summary,
        },
      });

      // Advance request status if decision is clear
      const newRequestStatus = requestStatusOnApproval[parsed.decision];
      if (newRequestStatus) {
        await prisma.purchaseRequest.update({
          where: { id: request.id },
          data: {
            status: newRequestStatus,
            ...(newRequestStatus === "APPROVED" ? { submittedAt: new Date() } : {}),
          },
        });
        result.action = `request_status → ${newRequestStatus}`;
      } else {
        result.action = `approval_status → ${newApprovalStatus} (no request change)`;
      }

      // Audit log
      await prisma.auditLog.create({
        data: {
          requestId: request.id,
          action: "EMAIL_REPLY_PROCESSED",
          details: `Reply from ${msg.from}: ${parsed.decision} (confidence: ${(parsed.confidence * 100).toFixed(0)}%) — ${parsed.summary}`,
        },
      });

      // Mark processed
      await markAsRead(msg.id);
      await moveToProcessed(msg.id);

      results.push(result);
    }

    return NextResponse.json({
      processed: results.length,
      matched: results.filter((r) => r.matched).length,
      results,
    });
  } catch (err: any) {
    console.error("poll error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET — quick status check (does not process, just counts unread)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!graphConfigured) {
    return NextResponse.json({ configured: false, unread: null });
  }

  try {
    const messages = await fetchUnreadMessages();
    return NextResponse.json({ configured: true, unread: messages.length });
  } catch (err: any) {
    return NextResponse.json({ configured: true, error: err.message }, { status: 500 });
  }
}
