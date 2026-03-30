import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Data retention cleanup endpoint.
 *
 * POST /api/admin/retention — run retention cleanup
 *
 * Policy:
 *   - ApiLog (telemetry): delete records older than 90 days
 *   - AuditLog: retain for 7 years (2555 days) per FERPA / records retention
 *
 * Access: SUPER_ADMIN only, or called via cron secret.
 */

const API_LOG_RETENTION_DAYS = 90;
const AUDIT_LOG_RETENTION_DAYS = 2555; // ~7 years

export async function POST(req: NextRequest) {
  // Auth: either a super admin session or a cron secret header
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = req.headers.get("x-cron-secret");

  if (cronSecret && headerSecret === cronSecret) {
    // Authorized via cron secret
  } else {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const user = session.user as any;
    if (user.role !== "SUPER_ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const apiLogCutoff = new Date(now.getTime() - API_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const auditLogCutoff = new Date(now.getTime() - AUDIT_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const [apiLogResult, auditLogResult] = await Promise.all([
    prisma.apiLog.deleteMany({
      where: { createdAt: { lt: apiLogCutoff } },
    }),
    prisma.auditLog.deleteMany({
      where: { createdAt: { lt: auditLogCutoff } },
    }),
  ]);

  const summary = {
    ok: true,
    cleaned: {
      apiLogs: { deleted: apiLogResult.count, olderThan: `${API_LOG_RETENTION_DAYS} days` },
      auditLogs: { deleted: auditLogResult.count, olderThan: `${AUDIT_LOG_RETENTION_DAYS} days (~7 years)` },
    },
    runAt: now.toISOString(),
  };

  console.log("[retention] cleanup complete:", JSON.stringify(summary));
  return NextResponse.json(summary);
}
