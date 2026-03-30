import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * FERPA Data Deletion / Export endpoint.
 *
 * GET  /api/users/:id/ferpa — export all PII for a user (data portability)
 * DELETE /api/users/:id/ferpa — purge PII for a user (right to deletion)
 *
 * Access: the user themselves, or a SUPER_ADMIN.
 */

function isAdmin(role: string) {
  return ["SUPER_ADMIN"].includes(role);
}

async function authorize(req: NextRequest, targetUserId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const user = session.user as any;
  // Users can request their own data; super admins can act on behalf of any user
  if (user.id !== targetUserId && !isAdmin(user.role)) return null;
  return user;
}

// ── GET: Export all PII associated with a user ───────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const caller = await authorize(req, params.id);
  if (!caller) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true, email: true, name: true, role: true, createdAt: true,
      orgMemberships: {
        select: { id: true, memberRole: true, status: true, organization: { select: { name: true, code: true } } },
      },
      submittedRequests: {
        select: { id: true, number: true, title: true, status: true, advisorEmail: true, advisorName: true, createdAt: true },
      },
      auditLogs: {
        select: { id: true, action: true, details: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({
    exportDate: new Date().toISOString(),
    ferpaNotice: "This export contains all personally identifiable information (PII) held for this user under FERPA.",
    user,
  });
}

// ── DELETE: Purge PII for a user ─────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const caller = await authorize(req, params.id);
  if (!caller) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Anonymize rather than hard-delete to preserve referential integrity
  // for financial records that may need to be retained for audit purposes.
  const anonymizedEmail = `deleted-${params.id}@redacted.local`;
  const anonymizedName = "Deleted User";

  await prisma.$transaction([
    // 1. Anonymize user record
    prisma.user.update({
      where: { id: params.id },
      data: {
        email: anonymizedEmail,
        name: anonymizedName,
        password: null,
        azureId: null,
        active: false,
      },
    }),

    // 2. Redact PII from audit log details (emails in free text)
    prisma.$executeRawUnsafe(
      `UPDATE "AuditLog" SET "details" = regexp_replace("details", '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}', '[redacted]', 'g') WHERE "userId" = $1`,
      params.id
    ),

    // 3. Redact advisor info on requests submitted by this user
    prisma.purchaseRequest.updateMany({
      where: { submittedById: params.id },
      data: {
        advisorEmail: "redacted@redacted.local",
        advisorName: "Redacted",
      },
    }),

    // 4. Remove org memberships
    prisma.organizationMember.deleteMany({
      where: { userId: params.id },
    }),

    // 5. Clear sessions and accounts
    prisma.session.deleteMany({ where: { userId: params.id } }),
    prisma.account.deleteMany({ where: { userId: params.id } }),
  ]);

  // Log the deletion action (using caller, not deleted user)
  await prisma.auditLog.create({
    data: {
      userId: caller.id,
      action: "FERPA_DELETION",
      details: `PII purged for user ${params.id} per FERPA right-to-deletion request`,
    },
  });

  return NextResponse.json({
    ok: true,
    message: "User PII has been purged. Financial records are retained in anonymized form for audit compliance.",
  });
}
