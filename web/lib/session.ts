// Edge-safe session helpers (used by middleware and server code). HS256 JWT in an HttpOnly cookie.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "dc_session";
export const GUEST_COOKIE = "dc_guest";

export type Session = { sub: string; name: string; email: string; role: "customer" | "admin" };

function key() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET missing or too short");
  return new TextEncoder().encode(s);
}

export async function signSession(s: Session, remember: boolean): Promise<string> {
  return new SignJWT({ name: s.name, email: s.email, role: s.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(s.sub)
    .setIssuedAt()
    .setExpirationTime(remember ? "30d" : "1d")
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    return { sub: payload.sub, name: String(payload.name ?? ""), email: String(payload.email ?? ""),
             role: payload.role === "admin" ? "admin" : "customer" };
  } catch {
    return null;
  }
}

export function safeNext(next: string | null | undefined, fallback = "/account"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}
