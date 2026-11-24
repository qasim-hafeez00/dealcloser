import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { q, q1 } from "@/lib/db";
import { sameOrigin } from "@/lib/auth";
import { GUEST_COOKIE, SESSION_COOKIE, safeNext, signSession, type Session } from "@/lib/session";
import { agentInternal } from "@/lib/agent";

export const dynamic = "force-dynamic";
const DUMMY_HASH = bcrypt.hashSync("timing-equaliser-not-a-password", 10);

const Signup = z.object({
  action: z.literal("signup"),
  name: z.string().trim().min(1, "Name is required").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(120),
  password: z.string().min(8, "Password must be at least 8 characters").max(100),
  next: z.string().optional(),
});
const Login = z.object({
  action: z.literal("login"),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password").max(100),
  remember: z.boolean().optional(),
  next: z.string().optional(),
});

async function startSession(s: Session, remember: boolean) {
  const c = await cookies();
  c.set(SESSION_COOKIE, await signSession(s, remember), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/",
    maxAge: remember ? 60 * 60 * 24 * 30 : undefined,
  });
  // Merge the guest's chat memory, bookings and history into the account (best effort).
  const guest = c.get(GUEST_COOKIE)?.value;
  if (guest?.startsWith("g_") && s.role === "customer") {
    await agentInternal("/internal/claim", { method: "POST", body: JSON.stringify({ guest_id: guest, user_id: s.sub }) });
  }
}

export async function POST(req: Request) {
  if (!(await sameOrigin())) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const data = await req.json().catch(() => ({}));
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;

  if (data?.action === "logout") {
    (await cookies()).delete(SESSION_COOKIE);
    return NextResponse.json({ ok: true, next: "/" });
  }

  if (data?.action === "signup") {
    const p = Signup.safeParse(data);
    if (!p.success) return NextResponse.json({ error: p.error.issues[0].message }, { status: 400 });
    const exists = await q1("SELECT 1 FROM users WHERE email=$1", [p.data.email]);
    if (exists) return NextResponse.json({ error: "An account with this email already exists. Try logging in." }, { status: 409 });
    const id = `u_${crypto.randomUUID().replace(/-/g, "")}`;
    const hash = await bcrypt.hash(p.data.password, 10);
    await q("INSERT INTO users (id, email, name, password_hash) VALUES ($1,$2,$3,$4)", [id, p.data.email, p.data.name, hash]);
    await q("INSERT INTO leads (user_id, name, email) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO NOTHING", [id, p.data.name, p.data.email]);
    await startSession({ sub: id, name: p.data.name, email: p.data.email, role: "customer" }, true);
    return NextResponse.json({ ok: true, next: safeNext(p.data.next, "/account") });
  }

  if (data?.action === "login") {
    const p = Login.safeParse(data);
    if (!p.success) return NextResponse.json({ error: p.error.issues[0].message }, { status: 400 });
    const fails = await q1<{ n: string }>(
      "SELECT count(*) AS n FROM login_attempts WHERE email=$1 AND success=false AND created_at > now() - interval '15 minutes'",
      [p.data.email]);
    if (Number(fails?.n ?? 0) >= 5) {
      return NextResponse.json({ error: "Too many failed attempts. Please wait 15 minutes and try again." }, { status: 429 });
    }
    const u = await q1<{ id: string; name: string; email: string; password_hash: string; role: "customer" | "admin" }>(
      "SELECT id, name, email, password_hash, role FROM users WHERE email=$1", [p.data.email]);
    const ok = u ? await bcrypt.compare(p.data.password, u.password_hash) : (await bcrypt.compare(p.data.password, DUMMY_HASH), false);
    await q("INSERT INTO login_attempts (email, ip, success) VALUES ($1,$2,$3)", [p.data.email, ip, !!(u && ok)]);
    if (!u || !ok) return NextResponse.json({ error: "Wrong email or password." }, { status: 401 });
    await q("UPDATE users SET last_login_at=now() WHERE id=$1", [u.id]);
    await startSession({ sub: u.id, name: u.name, email: u.email, role: u.role }, !!p.data.remember);
    return NextResponse.json({ ok: true, next: u.role === "admin" ? safeNext(p.data.next, "/admin") : safeNext(p.data.next, "/account") });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
