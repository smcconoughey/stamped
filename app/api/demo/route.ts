import { NextRequest, NextResponse } from "next/server";

/**
 * Toggle demo mode on or off.
 *
 *   GET /api/demo?on=true   → enable demo mode (default)
 *   GET /api/demo?on=false  → disable demo mode
 *
 * Sets/clears a cookie and redirects to the homepage.
 */
export async function GET(req: NextRequest) {
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
}
