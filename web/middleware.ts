import { NextResponse, type NextRequest } from "next/server";
import { GUEST_COOKIE, SESSION_COOKIE, verifySession } from "./lib/session";

// Route matrix: /account* needs a signed-in user; /admin* (and /api/admin*) needs role=admin.
// Every visitor gets a guest id cookie so the chat has a stable, server-side user_id.
export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/api/admin")) {
    if (!session || session.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  } else if (pathname.startsWith("/admin")) {
    if (!session) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname + search)}`, req.url));
    if (session.role !== "admin") return NextResponse.rewrite(new URL("/403", req.url), { status: 403 });
  } else if (pathname.startsWith("/account")) {
    if (!session) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname + search)}`, req.url));
  } else if ((pathname === "/login" || pathname === "/signup") && session) {
    return NextResponse.redirect(new URL(session.role === "admin" ? "/admin" : "/account", req.url));
  }

  const res = NextResponse.next();
  if (!req.cookies.get(GUEST_COOKIE)?.value) {
    res.cookies.set(GUEST_COOKIE, `g_${crypto.randomUUID()}`, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 180,
    });
  }
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
