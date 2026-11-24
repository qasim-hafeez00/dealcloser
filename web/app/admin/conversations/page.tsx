import Link from "next/link";
import { PageTitle } from "@/components/Kpi";
import { q } from "@/lib/db";
import { ago } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Conversations" };

export default async function Conversations({ searchParams }: { searchParams: Promise<{ source?: string }> }) {
  const sp = await searchParams;
  const src = sp.source === "web" || sp.source === "api" ? sp.source : null;
  const rows = await q<{ user_id: string; thread_id: string; turns: number; tokens: number; tools: number; blocked: number; first_msg: string; last_reply: string; last_at: string; source: string; name: string | null }>(`
    SELECT c.user_id, c.thread_id, count(*)::int turns, sum(c.tokens_in + c.tokens_out)::int tokens,
      sum(jsonb_array_length(c.tool_calls))::int tools, count(*) FILTER (WHERE c.blocked_by IS NOT NULL AND c.blocked_by <> 'empty')::int blocked,
      (array_agg(c.user_message ORDER BY c.id))[1] first_msg, (array_agg(c.reply ORDER BY c.id DESC))[1] last_reply,
      max(c.created_at) last_at, (array_agg(c.source ORDER BY c.id DESC))[1] source, max(l.name) name
    FROM chat_log c LEFT JOIN leads l ON l.user_id=c.user_id ${src ? "WHERE c.source=$1" : ""}
    GROUP BY c.user_id, c.thread_id ORDER BY max(c.created_at) DESC LIMIT 100`, src ? [src] : []);
  return (
    <>
      <PageTitle title="Conversations" sub="Latest 100 threads. 'web' = website chat widget, 'api' = direct API traffic (e.g. graders).">
        <div className="flex gap-1 rounded-xl bg-white p-1 shadow-sm">
          {[["All", ""], ["Website", "web"], ["API", "api"]].map(([l, v]) => (
            <Link key={l} href={v ? `/admin/conversations?source=${v}` : "/admin/conversations"} className={`rounded-lg px-3 py-1 text-sm ${(src ?? "") === v ? "bg-brand-700 text-white" : "text-slate-600"}`}>{l}</Link>
          ))}
        </div>
      </PageTitle>
      <div className="card divide-y divide-slate-100">
        {rows.map((r) => (
          <Link key={r.user_id + r.thread_id} href={`/admin/leads/${encodeURIComponent(r.user_id)}`} className="flex flex-col gap-1 p-4 hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4">
            <div className="w-48 shrink-0">
              <div className="truncate text-sm font-semibold text-brand-700">{r.name || r.user_id}</div>
              <div className="text-xs text-slate-400">thread {r.thread_id} · {r.source} · {ago(r.last_at)}</div>
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <div className="truncate font-medium">“{r.first_msg}”</div>
              <div className="truncate text-slate-500">Ava: {r.last_reply}</div>
            </div>
            <div className="flex shrink-0 gap-3 text-xs text-slate-500">
              <span>{r.turns} turns</span><span>{r.tools} tools</span><span>{r.tokens.toLocaleString()} tok</span>
              {r.blocked > 0 && <span className="badge bg-red-100 text-red-700">{r.blocked} blocked</span>}
            </div>
          </Link>
        ))}
        {rows.length === 0 && <p className="p-10 text-center text-sm text-slate-400">No conversations yet.</p>}
      </div>
    </>
  );
}
