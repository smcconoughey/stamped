import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateRequestNumber } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const orgId = searchParams.get("orgId");
  const assignedToMe = searchParams.get("assignedToMe") === "true";
  const search = searchParams.get("search");
  const limit = parseInt(searchParams.get("limit") || "50");

  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user.role);
  const isOrgLead = user.role === "ORG_LEAD";

  const where: any = {
    organization: { tenantId: user.tenantId },
  };

  if (isAdmin) {
    // admins see everything
  } else if (isOrgLead) {
    // org leads see all requests for orgs they lead
    const leadMemberships = await prisma.organizationMember.findMany({
      where: { userId: user.id, memberRole: "LEAD" },
      select: { organizationId: true },
    });
    const leadOrgIds = leadMemberships.map((m: { organizationId: string }) => m.organizationId);
    where.organizationId = { in: leadOrgIds };
  } else {
    // regular students see only their own
    where.submittedById = user.id;
  }

  if (status) {
    where.status = status;
  }

  if (orgId) {
    where.organizationId = orgId;
  }

  if (assignedToMe && isAdmin) {
    where.assignedToId = user.id;
  }

  if (search) {
    where.OR = [
      { number: { contains: search } },
      { title: { contains: search } },
      { organization: { name: { contains: search } } },
    ];
  }

  const requests = await prisma.purchaseRequest.findMany({
    where,
    include: {
      organization: { select: { id: true, name: true, code: true, costCenter: true } },
      budget: { select: { id: true, name: true, fiscalYear: true } },
      submittedBy: { select: { id: true, name: true, email: true } },
      assignedTo: { select: { id: true, name: true, email: true } },
      items: true,
      _count: { select: { items: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ requests });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  const body = await req.json();

  const {
    title,
    description,
    justification,
    organizationId,
    budgetId,
    advisorEmail,
    advisorName,
    vendorName,
    vendorUrl,
    vendorNote,
    neededBy,
    priority,
    items,
    submitNow,
  } = body;

  if (!title || !justification || !organizationId || !advisorEmail) {
    return NextResponse.json(
      { error: "Missing required fields: title, justification, organizationId, advisorEmail" },
      { status: 400 }
    );
  }

  // Get or create tenant settings for request numbering
  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: user.tenantId },
  });

  const prefix = settings?.requestPrefix || "REQ";
  const nextNum = (settings?.currentRequestNumber || 0) + 1;
  const number = generateRequestNumber(prefix, nextNum);

  // Update sequence
  await prisma.tenantSettings.upsert({
    where: { tenantId: user.tenantId },
    update: { currentRequestNumber: nextNum },
    create: {
      tenantId: user.tenantId,
      requestPrefix: prefix,
      currentRequestNumber: nextNum,
    },
  });

  // Calculate totals
  let totalEstimated = 0;
  if (items && items.length > 0) {
    totalEstimated = items.reduce((sum: number, item: any) => {
      return sum + (parseFloat(item.unitPrice || 0) * parseInt(item.quantity || 1));
    }, 0);
  }

  const request = await prisma.purchaseRequest.create({
    data: {
      number,
      title,
      description,
      justification,
      organizationId,
      budgetId: budgetId || undefined,
      submittedById: user.id,
      advisorEmail,
      advisorName,
      vendorName,
      vendorUrl,
      vendorNote,
      neededBy: neededBy ? new Date(neededBy) : null,
      priority: priority || "NORMAL",
      status: submitNow ? "SUBMITTED" : "DRAFT",
      submittedAt: submitNow ? new Date() : null,
      totalEstimated: totalEstimated || null,
      items: items && items.length > 0
        ? {
            create: items.map((item: any) => ({
              name: item.name,
              description: item.description,
              quantity: parseInt(item.quantity) || 1,
              unitPrice: item.unitPrice ? parseFloat(item.unitPrice) : null,
              totalPrice: item.unitPrice
                ? parseFloat(item.unitPrice) * (parseInt(item.quantity) || 1)
                : null,
              url: item.url,
              vendor: item.vendor,
            })),
          }
        : undefined,
    },
    include: {
      organization: true,
      submittedBy: { select: { id: true, name: true, email: true } },
      items: true,
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      requestId: request.id,
      userId: user.id,
      action: submitNow ? "SUBMITTED" : "CREATED",
      details: submitNow ? "Request submitted" : "Request saved as draft",
    },
  });

  return NextResponse.json({ request }, { status: 201 });
}

// Bulk update (status change for multiple requests)
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as any;
  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user.role);
  const isOrgLead = user.role === "ORG_LEAD";

  const { ids, status } = await req.json();
  if (!ids?.length || !status) {
    return NextResponse.json({ error: "ids and status required" }, { status: 400 });
  }

  const VALID_STATUSES = ["DRAFT","SUBMITTED","PENDING_APPROVAL","APPROVED","ORDERED","PARTIALLY_RECEIVED","RECEIVED","READY_FOR_PICKUP","PICKED_UP","CANCELLED"];
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  // Build ownership filter
  const ownerWhere: any = { id: { in: ids }, organization: { tenantId: user.tenantId } };
  if (!isAdmin && !isOrgLead) {
    ownerWhere.submittedById = user.id;
  } else if (isOrgLead) {
    const leadMemberships = await prisma.organizationMember.findMany({
      where: { userId: user.id, memberRole: "LEAD" },
      select: { organizationId: true },
    });
    ownerWhere.organizationId = { in: leadMemberships.map((m: { organizationId: string }) => m.organizationId) };
  }

  const now = new Date();
  const dateField: Record<string, any> = {
    ORDERED: { orderedAt: now },
    RECEIVED: { receivedAt: now },
    READY_FOR_PICKUP: { readyAt: now },
    PICKED_UP: { pickedUpAt: now },
  };

  const updated = await prisma.purchaseRequest.updateMany({
    where: ownerWhere,
    data: { status, ...(dateField[status] || {}) },
  });

  return NextResponse.json({ updated: updated.count });
}
