import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { GUEST_COOKIE, SESSION_COOKIE, verifySession, type Session } from "./session";

export async function getSession(): Promise<Session | null> {
  const c = await cookies();
  return verifySession(c.get(SESSION_COOKIE)?.value);
}

/** The agent user_id for this browser: signed-in u_... or guest g_... (set by middleware). */
export async function getActorId(): Promise<{ id: string; session: Session | null }> {
  const s = await getSession();
  if (s) return { id: s.sub, session: s };
  const c = await cookies();
  const g = c.get(GUEST_COOKIE)?.value;
  return { id: g && /^g_[a-f0-9-]{8,}$/.test(g) ? g : "", session: null };
}

export async function requireUser(next = "/account"): Promise<Session> {
  const s = await getSession();
  if (!s) redirect(`/login?next=${encodeURIComponent(next)}`);
  return s;
}

export async function requireAdmin(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login?next=/admin");
  if (s.role !== "admin") redirect("/403");
  return s;
}

/** CSRF defence for state-changing route handlers: the Origin must match our host. */
export async function sameOrigin(): Promise<boolean> {
  const h = await headers();
  const origin = h.get("origin");
  if (!origin) return true; // same-origin fetch from older browsers / server
  try {
    return new URL(origin).host === h.get("host");
  } catch {
    return false;
  }
}
