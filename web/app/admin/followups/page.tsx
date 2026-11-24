import Link from "next/link";
import { PageTitle, StageBadge } from "@/components/Kpi";
import { q } from "@/lib/db";
import { ago, money } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI follow-ups" };

export default async function Followups() {
  const due = await q<{ user_id: string; name: string | null; stage: string; score: number; budget_max: number | null; last_message_at: string | null }>(`
    SELECT l.user_id, l.name, l.stage, l.score, l.budget_max, l.last_message_at FROM leads l
    WHERE l.stage IN ('engaged','qualified','visit_booked') AND (l.last_message_at IS NULL OR l.last_message_at < now() - interval '1 hour')
      AND NOT EXISTS (SELECT 1 FROM followups f WHERE f.user_id=l.user_id AND f.created_at > now() - interval '3 days')
    ORDER BY l.score DESC LIMIT 20`);
  const recent = await q<{ id: number; user_id: string; name: string | null; channel: string; draft: string; status: string; created_at: string }>(
    "SELECT f.*, l.name FROM followups f JOIN leads l ON l.user_id=f.user_id ORDER BY f.id DESC LIMIT 30");
  return (
    <>
      <PageTitle title="AI follow-ups" sub="GrowthPilot integration: Ava drafts personalised follow-ups for warm leads that went quiet. Staff review before sending." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="text-sm font-semibold">Suggested: leads to follow up ({due.length})</h3>
          <ul className="mt-2 divide-y divide-slate-100">
            {due.map((l) => (
              <li key={l.user_id} className="flex items-center justify-between py-2.5 text-sm">
                <div><div className="font-medium">{l.name || "Anonymous"} <StageBadge stage={l.stage} /></div><div className="text-xs text-slate-500">score {l.score} · {money(l.budget_max)} · quiet {ago(l.last_message_at)}</div></div>
                <Link href={`/admin/leads/${encodeURIComponent(l.user_id)}`} className="btn-accent !py-1 text-xs">Draft follow-up</Link>
              </li>
            ))}
            {due.length === 0 && <li className="py-6 text-center text-sm text-slate-400">All warm leads are followed up.</li>}
          </ul>
        </div>
        <div className="card p-5">
          <h3 className="text-sm font-semibold">Recent drafts and sends</h3>
          <ul className="mt-2 space-y-3">
            {recent.map((f) => (
              <li key={f.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                <div className="flex justify-between text-xs text-slate-500"><Link href={`/admin/leads/${encodeURIComponent(f.user_id)}`} className="font-semibold text-brand-700">{f.name || f.user_id}</Link><span>{f.channel} · {f.status} · {ago(f.created_at)}</span></div>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-slate-600">{f.draft}</p>
              </li>
            ))}
            {recent.length === 0 && <li className="text-sm text-slate-400">No follow-ups yet.</li>}
          </ul>
        </div>
      </div>
    </>
  );
}
