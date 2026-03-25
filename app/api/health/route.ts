import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withTelemetry } from "@/lib/telemetry";

export const GET = withTelemetry(async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
});
