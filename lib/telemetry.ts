import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ── Cost per token by model (USD) ────────────────────────────────────────────
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  "claude-opus-4-6":          { input: 15 / 1_000_000, output: 75 / 1_000_000 },
  "claude-sonnet-4-6":        { input: 3 / 1_000_000,  output: 15 / 1_000_000 },
  "claude-haiku-4-5-20251001": { input: 0.8 / 1_000_000, output: 4 / 1_000_000 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[model] || { input: 3 / 1_000_000, output: 15 / 1_000_000 };
  return inputTokens * costs.input + outputTokens * costs.output;
}

// ── Route handler wrapper ────────────────────────────────────────────────────

type RouteHandler = (req: NextRequest, ctx?: any) => Promise<NextResponse | Response>;

export function withTelemetry(handler: RouteHandler): RouteHandler {
  return async (req: NextRequest, ctx?: any) => {
    const start = Date.now();
    let statusCode = 200;
    let errorMsg: string | undefined;
    let userId: string | undefined;
    let tenantId: string | undefined;

    try {
      // Try to get session for user/tenant tracking (non-blocking)
      try {
        const session = await getServerSession(authOptions);
        if (session?.user) {
          const u = session.user as any;
          userId = u.id;
          tenantId = u.tenantId;
        }
      } catch {
        // Session lookup failed — continue without user info
      }

      const response = await handler(req, ctx);
      statusCode = response.status;
      return response;
    } catch (err: any) {
      statusCode = 500;
      errorMsg = err.message?.slice(0, 500);
      throw err;
    } finally {
      const durationMs = Date.now() - start;
      const url = new URL(req.url);

      // Fire-and-forget — don't block the response
      prisma.apiLog
        .create({
          data: {
            method: req.method,
            path: url.pathname,
            statusCode,
            durationMs,
            userId,
            tenantId,
            error: errorMsg,
          },
        })
        .catch((e: any) => console.error("[telemetry] log write failed:", e.message));
    }
  };
}

// ── AI call tracker ──────────────────────────────────────────────────────────

export async function trackAiCall<T extends Record<string, any> & { usage: { input_tokens: number; output_tokens: number } }>(
  fn: () => Promise<T>,
  model: string,
  functionName: string
): Promise<T> {
  const start = Date.now();
  let statusCode = 200;
  let errorMsg: string | undefined;

  try {
    const result = await fn();
    const durationMs = Date.now() - start;
    const inputTokens = result.usage.input_tokens;
    const outputTokens = result.usage.output_tokens;
    const cost = estimateCost(model, inputTokens, outputTokens);

    // Fire-and-forget
    prisma.apiLog
      .create({
        data: {
          method: "AI",
          path: `/ai/${functionName}`,
          statusCode: 200,
          durationMs,
          aiModel: model,
          aiFunction: functionName,
          inputTokens,
          outputTokens,
          aiCostUsd: Math.round(cost * 1_000_000) / 1_000_000, // 6 decimal places
        },
      })
      .catch((e: any) => console.error("[telemetry] AI log write failed:", e.message));

    return result;
  } catch (err: any) {
    statusCode = 500;
    errorMsg = err.message?.slice(0, 500);
    const durationMs = Date.now() - start;

    prisma.apiLog
      .create({
        data: {
          method: "AI",
          path: `/ai/${functionName}`,
          statusCode,
          durationMs,
          aiModel: model,
          aiFunction: functionName,
          error: errorMsg,
        },
      })
      .catch((e: any) => console.error("[telemetry] AI log write failed:", e.message));

    throw err;
  }
}
