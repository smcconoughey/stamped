import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { anthropic } from "@/lib/claude";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messages, context } = await req.json();
  if (!messages?.length) return NextResponse.json({ error: "messages required" }, { status: 400 });

  const user = session.user as any;

  const systemPrompt = `You are a helpful assistant built into Stamped, a university student organization purchasing management system.

You help users with:
- Navigating and using the Stamped app (requests, budgets, organizations, import, admin queue)
- Understanding purchase request statuses: DRAFT → SUBMITTED → PENDING_APPROVAL → APPROVED → ORDERED → PARTIALLY_RECEIVED → RECEIVED → READY_FOR_PICKUP → PICKED_UP
- Budget management: budgets have a nickname, project number (e.g. PJ20006), and cost center (e.g. CC-1234)
- Import: uploading XLSX/CSV files to bulk import requests, budgets, or members — AI normalizes columns automatically
- Finance reports and spending analysis
- Organization and member management

Current user: ${user.name || user.email} (role: ${user.role})
${context ? `Current page context: ${context}` : ""}

Be concise and practical. If a question is about something outside Stamped, answer briefly but stay helpful. Use plain text — no markdown headers, just clear sentences.`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: systemPrompt,
    messages: messages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  });

  const text = response.content.find(b => b.type === "text");
  return NextResponse.json({ reply: text?.type === "text" ? text.text : "Sorry, I couldn't generate a response." });
}
