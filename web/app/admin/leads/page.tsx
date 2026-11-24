import Link from "next/link";
import { PageTitle, StageBadge } from "@/components/Kpi";
import { q } from "@/lib/db";
import { ago, money, STAGES, stageLabel } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leads" };

type Lead = { user_id: string; name: string | null; phone: string | null; email: string | null; stage: string; score: number; budget_max: number | null;
  body_type: string | null; min_seats: number | null; timeline: string | null; financing: string | null; message_count: number; last_message_at: string | null };

export default async function Leads({ searchParams }: { searchParams: Promise<{ stage?: string; view?: string; q?: string }> }) {
  const sp = await searchParams;
  const args: unknown[] = [];
  const where: string[] = [];
  if (sp.stage && (STAGES as readonly string[]).includes(sp.stage)) { args.push(sp.stage); where.push(`stage=$${args.length}`); }
  if (sp.q) { args.push(`%${sp.q.slice(0, 40)}%`); where.push(`(name ILIKE $${args.length} OR phone ILIKE $${args.length} OR email ILIKE $${args.length} OR user_id ILIKE $${args.length})`); }
  const leads = await q<Lead>(`SELECT * FROM leads ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY score DESC, last_message_at DESC NULLS LAST LIMIT 300`, args);
  const counts = await q<{ stage: string; n: number }>("SELECT stage, count(*)::int n FROM leads GROUP BY stage");
  const c = Object.fromEntries(counts.map((r) => [r.stage, r.n]));
  const board = sp.view === "board";

  return (
    <>
      <PageTitle title="Leads" sub="Every buyer who chatted with Ava, scored and staged automatically by the lead_tracker node.">
        <div className="flex gap-2">
          <Link href={`/admin/leads?view=${board ? "list" : "board"}`} className="btn-ghost">{board ? "List view" : "Pipeline board"}</Link>
        </div>
      </PageTitle>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Link href="/admin/leads" className={`badge !px-3 !py-1 ${!sp.stage ? "bg-brand-700 text-white" : "bg-white text-slate-600"}`}>All ({leads.length && !sp.stage ? leads.length : Object.values(c).reduce((a, b) => a + b, 0)})</Link>
        {STAGES.map((s) => <Link key={s} href={`/admin/leads?stage=${s}`} className={`badge !px-3 !py-1 ${sp.stage === s ? "bg-brand-700 text-white" : "bg-white text-slate-600"}`}>{stageLabel[s]} ({c[s] ?? 0})</Link>)}
        <form className="ml-auto"><input name="q" defaultValue={sp.q} placeholder="Search name, phone, email" className="input !w-64" /></form>
      </div>
      {board ? (
        <div className="grid gap-3 overflow-x-auto lg:grid-cols-6">
          {STAGES.map((s) => (
            <div key={s} className="min-w-48 rounded-2xl bg-slate-100 p-2">
              <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase text-slate-500"><span>{stageLabel[s]}</span><span>{c[s] ?? 0}</span></div>
              <div className="space-y-2">
                {leads.filter((l) => l.stage === s).slice(0, 30).map((l) => (
                  <Link key={l.user_id} href={`/admin/leads/${encodeURIComponent(l.user_id)}`} className="card block p-3 hover:shadow-md">
                    <div className="text-sm font-semibold">{l.name || "Anonymous"}</div>
                    <div className="text-xs text-slate-500">{money(l.budget_max)} · {l.body_type ?? "any"} · score {l.score}</div>
                    <div className="text-[11px] text-slate-400">{ago(l.last_message_at)}</div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="border-b border-slate-200 bg-slate-50"><tr>
              {["Buyer", "Stage", "Score", "Budget", "Needs", "Timeline", "Payment", "Msgs", "Last active"].map((h) => <th key={h} className="th">{h}</th>)}
            </tr></thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.user_id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="td">
                    <Link href={`/admin/leads/${encodeURIComponent(l.user_id)}`} className="font-semibold text-brand-700">{l.name || "Anonymous"}</Link>
                    <div className="text-xs text-slate-400">{l.phone || l.email || l.user_id.slice(0, 18)}</div>
                  </td>
                  <td className="td"><StageBadge stage={l.stage} /></td>
                  <td className="td"><div className="flex items-center gap-2"><div className="h-1.5 w-14 rounded bg-slate-200"><div className="h-1.5 rounded bg-brand-700" style={{ width: `${l.score}%` }} /></div>{l.score}</div></td>
                  <td className="td">{money(l.budget_max)}</td>
                  <td className="td capitalize">{[l.body_type, l.min_seats ? `${l.min_seats}+ seats` : null].filter(Boolean).join(", ") || "–"}</td>
                  <td className="td">{l.timeline?.replace(/_/g, " ") ?? "–"}</td>
                  <td className="td capitalize">{l.financing ?? "–"}</td>
                  <td className="td">{l.message_count}</td>
                  <td className="td text-xs text-slate-500">{ago(l.last_message_at)}</td>
                </tr>
              ))}
              {leads.length === 0 && <tr><td className="td py-10 text-center text-slate-400" colSpan={9}>No leads match.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
