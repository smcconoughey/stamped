import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

const DEMO_COOKIE = "stamped-demo";

// ── Rate-limit config ────────────────────────────────────────────────────────
// 10 login attempts per IP per 15-minute window
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    req.ip ||
    "unknown"
  );
}

// ── Demo-mode mock responses ─────────────────────────────────────────────────

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

  return { ok: true, demo: true };
}

// ── Middleware ────────────────────────────────────────────────────────────────

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // ── Rate-limit login attempts ──────────────────────────────────────────
  if (pathname === "/api/auth/callback/credentials" && method === "POST") {
    const ip = getClientIp(request);
    const result = rateLimit(`login:${ip}`, LOGIN_LIMIT, LOGIN_WINDOW_MS);

    if (!result.allowed) {
      const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSec),
            "X-RateLimit-Limit": String(LOGIN_LIMIT),
            "X-RateLimit-Remaining": "0",
          },
        },
      );
    }
  }

  // ── Demo mode ──────────────────────────────────────────────────────────
  const isDemoMode = request.cookies.get(DEMO_COOKIE)?.value === "true";
  if (!isDemoMode) return NextResponse.next();

  if (!pathname.startsWith("/api/")) return NextResponse.next();

  // Never intercept auth or demo-toggle routes
  if (pathname.startsWith("/api/auth/") || pathname.startsWith("/api/demo")) {
    return NextResponse.next();
  }

  // Allow reads through
  if (method === "GET" || method === "HEAD") return NextResponse.next();

  // Block write and return mock success
  return NextResponse.json(mockResponse(pathname, method), {
    status: 200,
    headers: { "x-demo-mode": "true" },
  });
}

export const config = {
  matcher: "/api/:path*",
};
