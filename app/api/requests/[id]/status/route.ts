import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["PENDING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED", "ON_HOLD"],
  PENDING_APPROVAL: ["APPROVED", "REJECTED", "CANCELLED", "ON_HOLD"],
  APPROVED: ["ORDERED", "CANCELLED", "ON_HOLD"],
  REJECTED: ["DRAFT"],
  ORDERED: ["PARTIALLY_RECEIVED", "RECEIVED", "CANCELLED"],
  PARTIALLY_RECEIVED: ["RECEIVED"],
  RECEIVED: ["READY_FOR_PICKUP"],
  READY_FOR_PICKUP: ["PICKED_UP"],
  PICKED_UP: [],
  CANCELLED: ["DRAFT"],
  ON_HOLD: ["SUBMITTED", "PENDING_APPROVAL", "APPROVED", "CANCELLED"],
};

const STATUS_TIMESTAMPS: Record<string, string> = {
  SUBMITTED: "submittedAt",
  ORDERED: "orderedAt",
  RECEIVED: "receivedAt",
  READY_FOR_PICKUP: "readyAt",
  PICKED_UP: "pickedUpAt",
};

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user.role);
  const isOrgLead = user.role === "ORG_LEAD";
  const body = await req.json();
  const { status, notes } = body;

  if (!status) {
    return NextResponse.json({ error: "Status is required" }, { status: 400 });
  }

  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: { organization: { select: { tenantId: true } } },
  });

  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (request.organization.tenantId !== user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // ORG_LEAD: can force-set any status on requests in their orgs
  if (isOrgLead) {
    const leadMemberships = await prisma.organizationMember.findMany({
      where: { userId: user.id, memberRole: "LEAD" },
      select: { organizationId: true },
    });
    const leadOrgIds = leadMemberships.map((m: { organizationId: string }) => m.organizationId);
    if (!leadOrgIds.includes(request.organizationId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // fall through — no transition check for org leads
  } else if (!isAdmin) {
    // Regular students: can only submit or cancel their own drafts
    if (request.submittedById !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!["SUBMITTED", "CANCELLED"].includes(status)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }
    const validNext = VALID_TRANSITIONS[request.status] || [];
    if (!validNext.includes(status)) {
      return NextResponse.json({ error: `Cannot transition from ${request.status} to ${status}` }, { status: 400 });
    }
  }
  // Admins and org leads: no transition restriction — they can set any valid status

  const timestampField = STATUS_TIMESTAMPS[status];
  const updateData: any = {
    status,
    ...(timestampField ? { [timestampField]: new Date() } : {}),
  };

  const updated = await prisma.purchaseRequest.update({
    where: { id: params.id },
    data: updateData,
    include: {
      organization: { select: { id: true, name: true, code: true } },
      submittedBy: { select: { id: true, name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      items: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      requestId: params.id,
      userId: user.id,
      action: "STATUS_CHANGED",
      details: `Status changed from ${request.status} to ${status}${notes ? `. Note: ${notes}` : ""}`,
    },
  });

  return NextResponse.json({ request: updated });
}
