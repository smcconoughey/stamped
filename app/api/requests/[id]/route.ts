import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user.role);

  const request = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: {
      organization: { select: { id: true, name: true, code: true } },
      submittedBy: { select: { id: true, name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      items: { orderBy: { createdAt: "asc" } },
      approvals: { orderBy: { createdAt: "desc" } },
      auditLogs: {
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
      },
      emailThreads: { orderBy: { createdAt: "desc" } },
      attachments: true,
    },
  });

  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  // Check access: non-admins can only see their own requests
  if (!isAdmin && request.submittedById !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ request });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user.role);
  const body = await req.json();

  const existing = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Non-admins can only edit their own draft requests
  if (!isAdmin) {
    if (existing.submittedById !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (existing.status !== "DRAFT") {
      return NextResponse.json({ error: "Cannot edit submitted request" }, { status: 403 });
    }
  }

  const allowedAdminFields: any = {};
  if (isAdmin) {
    if (body.adminNotes !== undefined) allowedAdminFields.adminNotes = body.adminNotes;
    if (body.assignedToId !== undefined) allowedAdminFields.assignedToId = body.assignedToId || null;
    if (body.totalActual !== undefined) allowedAdminFields.totalActual = body.totalActual;
  }

  const updatableFields: any = {
    ...allowedAdminFields,
  };

  if (body.title !== undefined) updatableFields.title = body.title;
  if (body.description !== undefined) updatableFields.description = body.description;
  if (body.justification !== undefined) updatableFields.justification = body.justification;
  if (body.advisorEmail !== undefined) updatableFields.advisorEmail = body.advisorEmail;
  if (body.advisorName !== undefined) updatableFields.advisorName = body.advisorName;
  if (body.vendorName !== undefined) updatableFields.vendorName = body.vendorName;
  if (body.vendorUrl !== undefined) updatableFields.vendorUrl = body.vendorUrl;
  if (body.neededBy !== undefined) updatableFields.neededBy = body.neededBy ? new Date(body.neededBy) : null;
  if (body.priority !== undefined) updatableFields.priority = body.priority;
  if (body.notes !== undefined) updatableFields.notes = body.notes;

  const updated = await prisma.purchaseRequest.update({
    where: { id: params.id },
    data: updatableFields,
    include: {
      organization: { select: { id: true, name: true, code: true } },
      submittedBy: { select: { id: true, name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      items: true,
    },
  });

  // Audit log for assignment change
  if (isAdmin && body.assignedToId !== undefined) {
    await prisma.auditLog.create({
      data: {
        requestId: params.id,
        userId: user.id,
        action: "ASSIGNED",
        details: body.assignedToId ? `Assigned to user ${body.assignedToId}` : "Unassigned",
      },
    });
  }

  return NextResponse.json({ request: updated });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as any;
  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user.role);
  const isOrgLead = user.role === "ORG_LEAD";

  const existing = await prisma.purchaseRequest.findUnique({
    where: { id: params.id },
    include: { organization: { select: { tenantId: true } } },
  });

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.organization.tenantId !== user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deletableStatuses = ["DRAFT", "SUBMITTED", "CANCELLED"];
  const canDelete =
    isAdmin ||
    (isOrgLead && deletableStatuses.includes(existing.status)) ||
    (existing.submittedById === user.id && deletableStatuses.includes(existing.status));

  if (!canDelete) {
    return NextResponse.json(
      { error: "Requests can only be deleted when in Draft, Submitted, or Cancelled status" },
      { status: 403 }
    );
  }

  // Cascade delete related records then the request
  await prisma.$transaction([
    prisma.auditLog.deleteMany({ where: { requestId: params.id } }),
    prisma.approval.deleteMany({ where: { requestId: params.id } }),
    prisma.emailThread.deleteMany({ where: { requestId: params.id } }),
    prisma.attachment.deleteMany({ where: { requestId: params.id } }),
    prisma.requestItem.deleteMany({ where: { requestId: params.id } }),
    prisma.purchaseRequest.delete({ where: { id: params.id } }),
  ]);

  return NextResponse.json({ ok: true });
}
