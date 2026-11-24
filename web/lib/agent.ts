import "server-only";

const BASE = (process.env.AGENT_API_URL || "http://localhost:7860").replace(/\/$/, "");

function authHeaders(): Record<string, string> {
  const t = process.env.SERVICE_TOKEN;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export type ChatBody = { reply: string; tool_calls: { name: string; args: Record<string, unknown> }[]; tokens: { in: number; out: number } };

export async function agentChat(userId: string, threadId: string, message: string): Promise<{ status: number; body: ChatBody; awaiting: boolean }> {
  const r = await fetch(`${BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-DealCloser-Source": "web", ...authHeaders() },
    body: JSON.stringify({ user_id: userId, thread_id: threadId, message }),
    signal: AbortSignal.timeout(55_000),
    cache: "no-store",
  });
  const body = (await r.json()) as ChatBody;
  return { status: r.status, body, awaiting: r.headers.get("x-awaiting-confirmation") === "true" };
}

export async function agentInternal<T = unknown>(path: string, init: RequestInit = {}): Promise<T | null> {
  try {
    const r = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...authHeaders(), ...(init.headers || {}) },
      signal: AbortSignal.timeout(50_000),
      cache: "no-store",
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}
