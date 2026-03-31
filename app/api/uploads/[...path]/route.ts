import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readFile, stat } from "fs/promises";
import path from "path";

/**
 * Serves uploaded attachment files from disk.
 *
 * GET /api/uploads/:requestId/:filename
 *
 * Auth: user must have access to the parent purchase request.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = session.user as any;

  const segments = params.path;
  if (segments.length < 2) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const requestId = segments[0];
  const filename = segments.slice(1).join("/");

  // Prevent directory traversal
  if (filename.includes("..") || requestId.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  // Auth: check the user has access to this request
  const purchaseReq = await prisma.purchaseRequest.findUnique({
    where: { id: requestId },
    select: {
      submittedById: true,
      organizationId: true,
      organization: { select: { tenantId: true } },
    },
  });

  if (!purchaseReq) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (purchaseReq.organization.tenantId !== user.tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user.role);
  if (!isAdmin && purchaseReq.submittedById !== user.id) {
    // Check org lead
    if (user.role === "ORG_LEAD") {
      const membership = await prisma.organizationMember.findFirst({
        where: { userId: user.id, organizationId: purchaseReq.organizationId, memberRole: "LEAD" },
      });
      if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    } else {
      // Check org membership
      const membership = await prisma.organizationMember.findFirst({
        where: { userId: user.id, organizationId: purchaseReq.organizationId, status: "APPROVED" },
      });
      if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const diskPath = path.join(process.cwd(), "uploads", requestId, filename);

  try {
    await stat(diskPath);
  } catch {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const buffer = await readFile(diskPath);
  const ext = path.extname(filename).toLowerCase().replace(".", "");
  const mimeMap: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
  };
  const contentType = mimeMap[ext] || "application/octet-stream";

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
