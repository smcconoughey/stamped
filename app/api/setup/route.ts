/**
 * POST /api/setup
 * One-time bootstrap: creates the first tenant + SUPER_ADMIN user.
 * Returns 409 if any users already exist — safe to leave enabled.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { withTelemetry } from "@/lib/telemetry";

export const GET = withTelemetry(async function GET() {
  const count = await prisma.user.count();
  return NextResponse.json({ needsSetup: count === 0 });
});

export const POST = withTelemetry(async function POST(req: NextRequest) {
  // Guard: only runs if DB is empty
  const count = await prisma.user.count();
  if (count > 0) {
    return NextResponse.json({ error: "Setup already complete." }, { status: 409 });
  }

  const { name, email, password, tenantName, tenantDomain } = await req.json();

  if (!email || !password || !tenantName || !tenantDomain) {
    return NextResponse.json({ error: "email, password, tenantName, and tenantDomain are required." }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }

  const slug = tenantDomain.split(".")[0].toLowerCase().replace(/[^a-z0-9]/g, "-");

  const tenant = await prisma.tenant.create({
    data: {
      name: tenantName,
      domain: tenantDomain,
      slug,
      settings: {
        create: {
          requestPrefix: "REQ",
          requireAdvisorApproval: true,
        },
      },
    },
  });

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email,
      name: name || email,
      role: "SUPER_ADMIN",
      tenantId: tenant.id,
      active: true,
      password: passwordHash,
    },
  });

  return NextResponse.json({ success: true, userId: user.id, tenantId: tenant.id });
});
