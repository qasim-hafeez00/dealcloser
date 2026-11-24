import { NextResponse } from "next/server";
import { getActorId, sameOrigin } from "@/lib/auth";
import { agentChat } from "@/lib/agent";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await sameOrigin())) return NextResponse.json({ error: "bad origin" }, { status: 403 });
  let body: { thread_id?: unknown; message?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ reply: "Invalid request.", tool_calls: [], tokens: { in: 0, out: 0 } }, { status: 400 });
  }
  // user_id is NEVER taken from the browser: it comes from the session or the guest cookie.
  const { id } = await getActorId();
  if (!id) return NextResponse.json({ reply: "Please refresh the page and try again.", tool_calls: [], tokens: { in: 0, out: 0 } }, { status: 400 });
  const thread = String(body.thread_id ?? "web").replace(/[^\w-]/g, "").slice(0, 64) || "web";
  const message = String(body.message ?? "").slice(0, 2000);
  try {
    const r = await agentChat(id, thread, message);
    return NextResponse.json({ ...r.body, awaiting_confirmation: r.awaiting }, { status: r.status });
  } catch {
    return NextResponse.json(
      { reply: "Ava is offline right now. Please use the contact form on the Visit page and we'll call you back.", tool_calls: [], tokens: { in: 0, out: 0 }, offline: true },
      { status: 503 },
    );
  }
}
