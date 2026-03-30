import { NextRequest, NextResponse } from "next/server";
import { withTelemetry } from "@/lib/telemetry";

/**
 * Toggle demo mode on or off.
 *
 *   GET /api/demo?on=true   → enable demo mode (default)
 *   GET /api/demo?on=false  → disable demo mode
 *
 * Sets/clears a cookie and redirects to the homepage.
 */
export const GET = withTelemetry(async function GET(req: NextRequest) {
  // Block demo mode in production to prevent real data exposure
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Demo mode is not available in production" }, { status: 403 });
  }

  const enable = req.nextUrl.searchParams.get("on") !== "false";
  const redirectTo = req.nextUrl.searchParams.get("redirect") || "/";
  const response = NextResponse.redirect(new URL(redirectTo, req.url));

  if (enable) {
    response.cookies.set("stamped-demo", "true", {
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
      httpOnly: false, // readable by client JS for banner
      sameSite: "lax",
    });
  } else {
    response.cookies.delete("stamped-demo");
  }

  return response;
});
