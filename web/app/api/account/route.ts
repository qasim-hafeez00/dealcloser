import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession, sameOrigin } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { agentInternal } from "@/lib/agent";
import { SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await sameOrigin())) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const data = await req.json().catch(() => ({}));

  if (data.action === "cancel_booking") {
    const id = Number(String(data.booking_id ?? "").replace(/\D/g, ""));
    const row = await q1(
      `UPDATE bookings SET status='cancelled', cancel_reason='Cancelled by customer on website', updated_at=now()
       WHERE id=$1 AND user_id=$2 AND status='confirmed' AND slot > now() RETURNING id`, [id, s.sub]);
    if (!row) return NextResponse.json({ error: "No upcoming test drive with that ID on your account." }, { status: 404 });
    const still = await q1("SELECT 1 FROM bookings WHERE user_id=$1 AND status='confirmed' AND slot > now()", [s.sub]);
    if (!still) await q("UPDATE leads SET stage = CASE WHEN score >= 60 THEN 'qualified' ELSE 'engaged' END WHERE user_id=$1 AND stage='visit_booked'", [s.sub]);
    return NextResponse.json({ ok: true });
  }

  if (data.action === "forget_memory") {
    const r = await agentInternal<{ deleted: number }>(`/internal/memory/${encodeURIComponent(s.sub)}`, { method: "DELETE" });
    if (!r) return NextResponse.json({ error: "Couldn't reach the assistant service. Please try again." }, { status: 502 });
    return NextResponse.json({ ok: true, deleted: r.deleted });
  }

  if (data.action === "delete_account") {
    await agentInternal(`/internal/memory/${encodeURIComponent(s.sub)}`, { method: "DELETE" });
    await q("UPDATE bookings SET status='cancelled', cancel_reason='Account deleted', updated_at=now() WHERE user_id=$1 AND status='confirmed' AND slot > now()", [s.sub]);
    await q("DELETE FROM chat_log WHERE user_id=$1", [s.sub]);
    await q("DELETE FROM callbacks WHERE user_id=$1", [s.sub]);
    await q("DELETE FROM leads WHERE user_id=$1", [s.sub]);
    await q("DELETE FROM users WHERE id=$1 AND role='customer'", [s.sub]);
    (await cookies()).delete(SESSION_COOKIE);
    return NextResponse.json({ ok: true, next: "/" });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
