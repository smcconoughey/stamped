import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { scrapeEmailForRequestStatus } from "@/lib/claude";

export async function POST(req: NextRequest) {
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
    const body = await req.json();
    const { emailContent } = body;

    if (!emailContent || typeof emailContent !== "string") {
      return NextResponse.json({ error: "emailContent is required" }, { status: 400 });
    }

    const result = await scrapeEmailForRequestStatus(emailContent);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Email scrape error:", error);
    return NextResponse.json({ error: "Failed to process email" }, { status: 500 });
  }
}
