import { NextResponse } from "next/server";
import { getSession, sameOrigin } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { agentInternal } from "@/lib/agent";
import { STAGES } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await sameOrigin())) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const s = await getSession();
  if (!s || s.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const d = await req.json().catch(() => ({}));

  switch (d.action) {
    case "lead_update": {
      const stage = d.stage && (STAGES as readonly string[]).includes(d.stage) ? d.stage : null;
      await q(
        `UPDATE leads SET stage=COALESCE($2, stage), admin_notes=COALESCE($3, admin_notes),
           lost_reason=CASE WHEN $2='lost' THEN COALESCE($4, lost_reason) ELSE lost_reason END, updated_at=now()
         WHERE user_id=$1`,
        [d.user_id, stage, typeof d.admin_notes === "string" ? d.admin_notes.slice(0, 2000) : null, d.lost_reason ?? null]);
      return NextResponse.json({ ok: true });
    }
    case "booking_status": {
      if (!["confirmed", "cancelled", "completed", "no_show"].includes(d.status)) return NextResponse.json({ error: "bad status" }, { status: 400 });
      const b = await q1<{ user_id: string }>(
        "UPDATE bookings SET status=$2, cancel_reason=CASE WHEN $2='cancelled' THEN 'Cancelled by dealer' ELSE cancel_reason END, updated_at=now() WHERE id=$1 RETURNING user_id",
        [Number(d.id), d.status]);
      if (b && d.status === "completed") await q("UPDATE leads SET updated_at=now() WHERE user_id=$1", [b.user_id]);
      return NextResponse.json({ ok: true });
    }
    case "callback_status": {
      if (!["open", "done", "dismissed"].includes(d.status)) return NextResponse.json({ error: "bad status" }, { status: 400 });
      await q("UPDATE callbacks SET status=$2 WHERE id=$1", [Number(d.id), d.status]);
      return NextResponse.json({ ok: true });
    }
    case "vehicle_update": {
      const status = ["available", "reserved", "sold"].includes(d.status) ? d.status : null;
      const price = Number.isFinite(Number(d.price)) && Number(d.price) > 0 ? Math.round(Number(d.price)) : null;
      await q("UPDATE vehicles SET status=COALESCE($2,status), price=COALESCE($3,price), featured=COALESCE($4,featured), updated_at=now() WHERE id=$1",
        [d.id, status, price, typeof d.featured === "boolean" ? d.featured : null]);
      return NextResponse.json({ ok: true });
    }
    case "followup_draft": {
      const r = await agentInternal<{ id: number; draft: string }>("/internal/followups/draft", {
        method: "POST", body: JSON.stringify({ user_id: d.user_id, channel: d.channel === "sms" ? "sms" : "email" }) });
      if (!r) return NextResponse.json({ error: "Couldn't generate a draft right now." }, { status: 502 });
      return NextResponse.json({ ok: true, ...r });
    }
    case "followup_update": {
      const status = ["draft", "sent", "dismissed"].includes(d.status) ? d.status : null;
      await q("UPDATE followups SET draft=COALESCE($2,draft), status=COALESCE($3,status), sent_at=CASE WHEN $3='sent' THEN now() ELSE sent_at END WHERE id=$1",
        [Number(d.id), typeof d.draft === "string" ? d.draft.slice(0, 2000) : null, status]);
      return NextResponse.json({ ok: true });
    }
    case "policy_update": {
      await q("UPDATE dealer_policies SET answer=$2 WHERE topic=$1", [d.topic, String(d.answer ?? "").slice(0, 1000)]);
      return NextResponse.json({ ok: true });
    }
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
