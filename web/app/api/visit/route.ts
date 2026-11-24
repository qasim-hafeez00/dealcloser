import { NextResponse } from "next/server";
import { z } from "zod";
import { getActorId, sameOrigin } from "@/lib/auth";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

const Form = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  contact: z.string().trim().min(5, "Phone or email is required").max(120),
  message: z.string().trim().min(3, "Tell us how we can help").max(500),
  preferred_time: z.string().trim().max(100).optional(),
});

export async function POST(req: Request) {
  if (!(await sameOrigin())) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const p = Form.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return NextResponse.json({ error: p.error.issues[0].message }, { status: 400 });
  const { id } = await getActorId();
  const uid = id || `g_${crypto.randomUUID()}`;
  await q("INSERT INTO leads (user_id, name) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET name=COALESCE(leads.name, EXCLUDED.name)", [uid, p.data.name]);
  const r = await q<{ id: number }>(
    "INSERT INTO callbacks (user_id, reason, preferred_time, contact, source) VALUES ($1,$2,$3,$4,'visit_form') RETURNING id",
    [uid, `${p.data.name}: ${p.data.message}`, p.data.preferred_time || null, p.data.contact]);
  return NextResponse.json({ ok: true, id: `CB-${r[0].id}` });
}
