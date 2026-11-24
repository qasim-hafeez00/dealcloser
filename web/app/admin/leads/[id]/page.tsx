import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, X } from "lucide-react";
import { PageTitle, StageBadge } from "@/components/Kpi";
import { agentInternal } from "@/lib/agent";
import { q, q1 } from "@/lib/db";
import { money, slot, when } from "@/lib/format";
import LeadEditor from "./LeadEditor";
import FollowupDraft from "./FollowupDraft";

export const dynamic = "force-dynamic";

type Lead = Record<string, string | number | null> & { user_id: string; stage: string; score: number };
type Mem = { profile: Record<string, unknown>; notes: { text: string; created_at: string }[]; viewed: string[] };

export default async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = decodeURIComponent(raw);
  const lead = await q1<Lead>("SELECT * FROM leads WHERE user_id=$1", [id]);
  if (!lead) notFound();
  const [mem, bookings, callbacks, chats, followups] = await Promise.all([
    agentInternal<Mem>(`/internal/memory/${encodeURIComponent(id)}`),
    q<{ id: number; vehicle_id: string; slot: string; status: string }>("SELECT id, vehicle_id, slot, status FROM bookings WHERE user_id=$1 ORDER BY slot DESC", [id]),
    q<{ id: number; reason: string; contact: string; status: string; created_at: string }>("SELECT id, reason, contact, status, created_at FROM callbacks WHERE user_id=$1 ORDER BY id DESC", [id]),
    q<{ id: number; thread_id: string; user_message: string; reply: string; tool_calls: { name: string }[]; tokens_in: number; tokens_out: number; blocked_by: string | null; awaiting_confirmation: boolean; created_at: string }>(
      "SELECT id, thread_id, user_message, reply, tool_calls, tokens_in, tokens_out, blocked_by, awaiting_confirmation, created_at FROM chat_log WHERE user_id=$1 ORDER BY id DESC LIMIT 60", [id]),
    q<{ id: number; channel: string; draft: string; status: string; created_at: string }>("SELECT id, channel, draft, status, created_at FROM followups WHERE user_id=$1 ORDER BY id DESC", [id]),
  ]);
  const upcoming = bookings.some((b) => b.status === "confirmed" && new Date(b.slot) > new Date());
  const p = lead;
  const breakdown: [string, number, boolean][] = [
    ["Budget known", 25, !!p.budget_max], ["Timeline given", 20, !!p.timeline && p.timeline !== "just_browsing"],
    ["Financing preference", 15, !!p.financing], ["Needs known (body/seats)", 15, !!(p.body_type || p.min_seats)],
    ["Contact details", 15, !!(p.name && (p.phone || p.email))], ["Upcoming test drive", 10, upcoming],
  ];

  return (
    <>
      <Link href="/admin/leads" className="text-sm text-slate-500 hover:underline">← Leads</Link>
      <PageTitle title={String(lead.name || "Anonymous buyer")} sub={`${lead.user_id} · created ${when(String(lead.created_at))}`}>
        <div className="flex items-center gap-3"><StageBadge stage={lead.stage} /><span className="text-2xl font-bold">{lead.score}<span className="text-sm text-slate-400">/100</span></span></div>
      </PageTitle>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="text-sm font-semibold">Profile</h3>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              {[["Phone", p.phone], ["Email", p.email], ["Budget", money(p.budget_max as number | null)], ["Body", p.body_type], ["Seats", p.min_seats], ["Fuel", p.fuel],
                ["Timeline", String(p.timeline ?? "").replace(/_/g, " ")], ["Payment", p.financing], ["Trade-in", p.trade_in], ["Messages", p.message_count]].map(([k, v]) => (
                <div key={String(k)}><dt className="text-xs text-slate-400">{k}</dt><dd className="font-medium capitalize">{v || "–"}</dd></div>
              ))}
            </dl>
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-semibold">Score breakdown</h3>
            <ul className="mt-2 space-y-1.5 text-sm">
              {breakdown.map(([l, pts, ok]) => (
                <li key={l} className="flex items-center justify-between">
                  <span className="flex items-center gap-2">{ok ? <Check size={14} className="text-emerald-600" /> : <X size={14} className="text-slate-300" />}{l}</span>
                  <span className={ok ? "font-semibold" : "text-slate-300"}>+{pts}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="card p-5">
            <h3 className="text-sm font-semibold">Long-term memory (agent store)</h3>
            {!mem ? <p className="mt-2 text-sm text-slate-400">Agent API unavailable.</p> : (
              <div className="mt-2 space-y-2 text-sm">
                {mem.notes.length > 0 ? mem.notes.map((n, i) => <p key={i}>• {n.text}</p>) : <p className="text-slate-400">No notes.</p>}
                {mem.viewed.length > 0 && <p className="text-xs text-slate-500">Viewed: {mem.viewed.map((v) => <Link key={v} href={`/inventory/${v}`} className="mr-1 font-mono text-brand-700">{v}</Link>)}</p>}
              </div>
            )}
          </div>
          <LeadEditor userId={lead.user_id} stage={lead.stage} notes={String(lead.admin_notes ?? "")} />
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card p-5">
              <h3 className="text-sm font-semibold">Test drives</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {bookings.map((b) => <li key={b.id}>TD-{b.id} · <span className="font-mono text-xs">{b.vehicle_id}</span> · {slot(b.slot)} · <span className="capitalize">{b.status.replace("_", " ")}</span></li>)}
                {bookings.length === 0 && <li className="text-slate-400">None</li>}
              </ul>
            </div>
            <div className="card p-5">
              <h3 className="text-sm font-semibold">Callback requests</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {callbacks.map((c) => <li key={c.id}>CB-{c.id} · {c.reason} <span className="text-xs text-slate-400">({c.status})</span></li>)}
                {callbacks.length === 0 && <li className="text-slate-400">None</li>}
              </ul>
            </div>
          </div>
          <FollowupDraft userId={lead.user_id} existing={followups} />
          <div className="card p-5">
            <h3 className="text-sm font-semibold">Transcript ({chats.length} turns)</h3>
            <div className="mt-3 max-h-[600px] space-y-3 overflow-y-auto pr-1">
              {[...chats].reverse().map((c) => (
                <div key={c.id} className="space-y-1 text-sm">
                  <div className="text-[11px] text-slate-400">{when(c.created_at)} · thread {c.thread_id} · {c.tokens_in}/{c.tokens_out} tok</div>
                  <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-sm bg-brand-700 px-3 py-1.5 text-white">{c.user_message}</div>
                  <div className={`w-fit max-w-[85%] rounded-2xl rounded-tl-sm px-3 py-1.5 ${c.blocked_by ? "bg-red-50 text-red-700" : c.awaiting_confirmation ? "border border-amber-300 bg-amber-50" : "bg-slate-100"}`}>
                    {c.tool_calls?.length > 0 && <div className="mb-1 text-[11px] text-slate-500">🔧 {c.tool_calls.map((t) => t.name).join(", ")}</div>}
                    <span className="whitespace-pre-wrap">{c.reply}</span>
                    {c.blocked_by && <div className="mt-1 text-[11px] font-semibold uppercase">blocked: {c.blocked_by}</div>}
                  </div>
                </div>
              ))}
              {chats.length === 0 && <p className="text-sm text-slate-400">No messages.</p>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
