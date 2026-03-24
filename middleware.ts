import { NextRequest, NextResponse } from "next/server";

const DEMO_COOKIE = "stamped-demo";

/**
 * Returns a plausible mock response for write endpoints so the UI
 * behaves normally without persisting anything.
 */
function mockResponse(pathname: string, method: string): Record<string, unknown> {
  const ts = Date.now().toString(36);

  if (pathname === "/api/requests" && method === "POST") {
    return { request: { id: `demo-${ts}`, number: `DEMO-0000` }, demo: true };
  }
  if (pathname.match(/^\/api\/requests\/[^/]+\/status$/) && method === "POST") {
    return { ok: true, demo: true };
  }
  if (pathname.match(/^\/api\/requests\/[^/]+$/) && (method === "PATCH" || method === "DELETE")) {
    return { ok: true, demo: true };
  }
  if (pathname === "/api/onboard" && method === "POST") {
    return { ok: true, demo: true };
  }
  if (pathname === "/api/organizations" && method === "POST") {
    return { organization: { id: `demo-org-${ts}` }, demo: true };
  }
  if (pathname.match(/^\/api\/organizations\/[^/]+\/members/) && method !== "GET") {
    return { ok: true, demo: true };
  }
  if (pathname.match(/^\/api\/organizations\/[^/]+\/budgets/) && method !== "GET") {
    return { ok: true, demo: true };
  }
  if (pathname === "/api/import" || pathname.match(/^\/api\/import\//)) {
    // Let AI parse (read-only) through; block actual imports
    if (pathname === "/api/import/ai-parse") return { rows: [], metadata: {}, warnings: ["Demo mode — nothing imported"], demo: true };
    return { ok: true, imported: 0, demo: true };
  }
  if (pathname.match(/^\/api\/email\//)) {
    return { ok: true, message: "Email simulated (demo mode)", demo: true };
  }
  if (pathname === "/api/platform/tenants" && method === "POST") {
    return { tenant: { id: `demo-tenant-${ts}` }, demo: true };
  }
  if (pathname.match(/^\/api\/platform\//) && method !== "GET") {
    return { ok: true, demo: true };
  }
  if (pathname === "/api/ai-chat") {
    return { reply: "Demo mode — AI chat disabled.", demo: true };
  }
  if (pathname === "/api/setup" && method === "POST") {
    return { ok: true, demo: true };
  }

  // Catch-all for any other write
  return { ok: true, demo: true };
}

export function middleware(request: NextRequest) {
  const isDemoMode = request.cookies.get(DEMO_COOKIE)?.value === "true";
  if (!isDemoMode) return NextResponse.next();

  const { pathname } = request.nextUrl;
  const method = request.method;

  // Only intercept API write methods
  if (!pathname.startsWith("/api/")) return NextResponse.next();

  // Never intercept auth or demo-toggle routes
  if (pathname.startsWith("/api/auth/") || pathname.startsWith("/api/demo")) {
    return NextResponse.next();
  }

  // Allow GET/HEAD through — reads are fine
  if (method === "GET" || method === "HEAD") return NextResponse.next();

  // Block the write and return a mock success
  return NextResponse.json(mockResponse(pathname, method), {
    status: 200,
    headers: { "x-demo-mode": "true" },
  });
}

export const config = {
  matcher: "/api/:path*",
};
