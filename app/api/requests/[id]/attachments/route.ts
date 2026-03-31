import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return map[mime] || "bin";
}

async function authorizeForRequest(requestId: string, user: any) {
  const req = await prisma.purchaseRequest.findUnique({
    where: { id: requestId },
    select: { submittedById: true, organizationId: true, organization: { select: { tenantId: true } } },
  });
  if (!req) return null;
  if (req.organization.tenantId !== user.tenantId) return null;

  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user.role);
  if (isAdmin) return req;

  if (req.submittedById === user.id) return req;

  // org leads can access
  if (user.role === "ORG_LEAD") {
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: user.id, organizationId: req.organizationId, memberRole: "LEAD" },
    });
    if (membership) return req;
  }

  return null;
}

// ── POST: Upload attachments ─────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;

  const purchaseReq = await authorizeForRequest(params.id, user);
  if (!purchaseReq) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await req.formData();
  const files = formData.getAll("files") as File[];

  if (!files.length) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  // Validate
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File "${file.name}" exceeds 10 MB limit` },
        { status: 400 }
      );
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `File type "${file.type}" is not allowed. Accepted: PDF, PNG, JPG, WEBP, GIF` },
        { status: 400 }
      );
    }
  }

  const uploadDir = path.join(process.cwd(), "uploads", params.id);
  await mkdir(uploadDir, { recursive: true });

  const created: any[] = [];

  for (const file of files) {
    const fileId = crypto.randomUUID();
    const ext = extFromMime(file.type);
    const diskName = `${fileId}.${ext}`;
    const diskPath = path.join(uploadDir, diskName);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(diskPath, buffer);

    const attachment = await prisma.attachment.create({
      data: {
        requestId: params.id,
        filename: file.name,
        url: `/api/uploads/${params.id}/${diskName}`,
        mimeType: file.type,
        size: file.size,
      },
    });

    created.push(attachment);
  }

  // Audit log
  await prisma.auditLog.create({
    data: {
      requestId: params.id,
      userId: user.id,
      action: "ATTACHMENT_ADDED",
      details: `Attached ${created.length} file(s): ${created.map((a) => a.filename).join(", ")}`,
    },
  });

  return NextResponse.json({ attachments: created }, { status: 201 });
}

// ── DELETE: Remove a single attachment ───────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;

  const purchaseReq = await authorizeForRequest(params.id, user);
  if (!purchaseReq) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const attachmentId = searchParams.get("attachmentId");
  if (!attachmentId) {
    return NextResponse.json({ error: "attachmentId query param required" }, { status: 400 });
  }

  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
  });
  if (!attachment || attachment.requestId !== params.id) {
    return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
  }

  // Delete file from disk
  const urlPath = attachment.url.replace("/api/uploads/", "");
  const diskPath = path.join(process.cwd(), "uploads", urlPath);
  try {
    await unlink(diskPath);
  } catch {
    // File may already be gone — continue
  }

  await prisma.attachment.delete({ where: { id: attachmentId } });

  await prisma.auditLog.create({
    data: {
      requestId: params.id,
      userId: user.id,
      action: "ATTACHMENT_REMOVED",
      details: `Removed attachment: ${attachment.filename}`,
    },
  });

  return NextResponse.json({ ok: true });
}
