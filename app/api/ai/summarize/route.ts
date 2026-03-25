import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { summarizeRequestQueue } from "@/lib/claude";
import { differenceInDays } from "date-fns";
import { withTelemetry } from "@/lib/telemetry";

export const POST = withTelemetry(async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;
  const isAdmin = ["ADMIN_STAFF", "FINANCE_ADMIN", "SUPER_ADMIN"].includes(user.role);

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const requests = await prisma.purchaseRequest.findMany({
      where: {
        organization: { tenantId: user.tenantId },
        status: {
          in: ["SUBMITTED", "PENDING_APPROVAL", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED", "RECEIVED", "READY_FOR_PICKUP"],
        },
      },
      include: {
        organization: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    if (requests.length === 0) {
      return NextResponse.json({ summary: "The queue is empty. No active requests at this time." });
    }

    const queueData = requests.map((r) => ({
      number: r.number,
      title: r.title,
      status: r.status,
      organization: r.organization.name,
      priority: r.priority,
      daysOld: differenceInDays(new Date(), r.createdAt),
    }));

    const summary = await summarizeRequestQueue(queueData);
    return NextResponse.json({ summary });
  } catch (error) {
    console.error("AI summarize error:", error);
    return NextResponse.json({ error: "Failed to generate summary" }, { status: 500 });
  }
});
