import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = session.user as any;

  const organizations = await prisma.organization.findMany({
    where: {
      tenantId: user.tenantId,
      active: true,
    },
    include: {
      budgets: {
        orderBy: { fiscalYear: "desc" },
        take: 1,
      },
      _count: { select: { requests: true, members: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ organizations });
}
