import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getOrg(id: string, tenantId: string) {
  return prisma.organization.findFirst({ where: { id, tenantId } });
}

function isAdmin(role: string) {
  return ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(role);
}

// GET — list members (with status). Accessible to admins, owners, and leads of the org.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as any;
  const org = await getOrg(params.id, user.tenantId);
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Must be admin or an approved lead/owner of this org
  if (!isAdmin(user.role)) {
    const self = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: params.id, userId: user.id } },
    });
    const canView = self?.status === "APPROVED" && ["OWNER", "LEAD"].includes(self.memberRole);
    if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const members = await prisma.organizationMember.findMany({
    where: { organizationId: params.id },
    include: { user: { select: { id: true, name: true, email: true, role: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ members });
}

// POST — join request (student self-enrolls as PENDING)
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as any;
  const org = await getOrg(params.id, user.tenantId);
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Check if already a member
  const existing = await prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId: params.id, userId: user.id } },
  });
  if (existing) {
    return NextResponse.json({
      error: existing.status === "PENDING"
        ? "You already have a pending request to join this organization"
        : existing.status === "REJECTED"
        ? "Your request was rejected. Contact an admin to be added manually."
        : "You are already a member of this organization",
    }, { status: 409 });
  }

  // Check if org has an owner — if no owner, first to join becomes owner (approved immediately)
  const ownerExists = await prisma.organizationMember.findFirst({
    where: { organizationId: params.id, memberRole: "OWNER", status: "APPROVED" },
  });

  const newMember = await prisma.organizationMember.create({
    data: {
      organizationId: params.id,
      userId: user.id,
      memberRole: ownerExists ? "MEMBER" : "OWNER",
      status: ownerExists ? "PENDING" : "APPROVED",
    },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json({ member: newMember, isOwner: !ownerExists }, { status: 201 });
}

// PATCH — approve/reject member OR change role (admin or owner only)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as any;
  const org = await getOrg(params.id, user.tenantId);
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Must be admin or approved owner of this org
  if (!isAdmin(user.role)) {
    const self = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: params.id, userId: user.id } },
    });
    if (self?.memberRole !== "OWNER" || self?.status !== "APPROVED") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { memberId, status, memberRole } = await req.json();
  if (!memberId) return NextResponse.json({ error: "memberId required" }, { status: 400 });

  // Validate status
  const VALID_STATUSES = ["PENDING", "APPROVED", "REJECTED"];
  const VALID_ROLES = ["MEMBER", "LEAD", "OWNER"];
  if (status && !VALID_STATUSES.includes(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  if (memberRole && !VALID_ROLES.includes(memberRole)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  // If promoting to OWNER, demote existing owner first
  if (memberRole === "OWNER") {
    await prisma.organizationMember.updateMany({
      where: { organizationId: params.id, memberRole: "OWNER" },
      data: { memberRole: "LEAD" },
    });
  }

  const update: any = {};
  if (status) update.status = status;
  if (memberRole) update.memberRole = memberRole;

  const updated = await prisma.organizationMember.update({
    where: { id: memberId },
    data: update,
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json({ member: updated });
}

// DELETE — remove a member (admin or owner only; cannot remove yourself if last owner)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = session.user as any;
  const org = await getOrg(params.id, user.tenantId);
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!isAdmin(user.role)) {
    const self = await prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: params.id, userId: user.id } },
    });
    if (self?.memberRole !== "OWNER" || self?.status !== "APPROVED") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { memberId } = await req.json();
  if (!memberId) return NextResponse.json({ error: "memberId required" }, { status: 400 });

  await prisma.organizationMember.delete({ where: { id: memberId } });
  return NextResponse.json({ ok: true });
}
