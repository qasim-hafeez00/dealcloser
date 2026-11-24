import Link from "next/link";
import { BarCard, LineCard } from "@/components/Charts";
import Kpi, { PageTitle, StageBadge } from "@/components/Kpi";
import { q } from "@/lib/db";
import { ago, money, slot } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

const DAYS_OPTIONS = [7, 14, 30];

export default async function Overview({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams;
  const days = DAYS_OPTIONS.includes(Number(sp.days)) ? Number(sp.days) : 14;
  const since = `now() - interval '${days} days'`;

  const [k] = await q<Record<string, string>>(`SELECT
      (SELECT count(DISTINCT user_id || thread_id) FROM chat_log WHERE created_at > ${since}) AS convos,
      (SELECT count(*) FROM chat_log WHERE created_at > ${since}) AS messages,
      (SELECT count(*) FROM leads WHERE created_at > ${since}) AS new_leads,
      (SELECT count(*) FROM leads WHERE stage IN ('qualified','visit_booked','won')) AS qualified,
      (SELECT count(*) FROM leads) AS leads_total,
      (SELECT count(*) FROM bookings WHERE created_at > ${since}) AS booked,
      (SELECT count(*) FROM bookings WHERE status='confirmed' AND slot > now()) AS upcoming,
      (SELECT count(*) FROM chat_log WHERE blocked_by IN ('injection','off_topic','fraud','other_user','output_leak') AND created_at > ${since}) AS blocked,
      (SELECT count(*) FROM callbacks WHERE status='open') AS callbacks_open,
      (SELECT COALESCE(avg(latency_ms) FILTER (WHERE tokens_in > 0),0)::int FROM chat_log WHERE created_at > ${since}) AS latency,
      (SELECT COALESCE(sum(tokens_in - cache_read),0)*0.10/1e6 + COALESCE(sum(cache_read),0)*0.01/1e6 + COALESCE(sum(tokens_out),0)*0.50/1e6 FROM chat_log) AS spend,
      (SELECT count(*) FILTER (WHERE stage='won') FROM leads) AS won`);

  const perDay = await q<{ day: string; conversations: number; bookings: number; leads: number }>(`
    WITH d AS (SELECT generate_series((now() - interval '${days - 1} days')::date, now()::date, '1 day')::date AS day)
    SELECT to_char(d.day, 'DD Mon') AS day,
      (SELECT count(DISTINCT user_id || thread_id) FROM chat_log c WHERE c.created_at::date = d.day)::int AS conversations,
      (SELECT count(*) FROM bookings b WHERE b.created_at::date = d.day)::int AS bookings,
      (SELECT count(*) FROM leads l WHERE l.created_at::date = d.day)::int AS leads
    FROM d ORDER BY d.day`);
  const funnel = await q<{ stage: string; n: number }>(`
    SELECT s.stage, (SELECT count(*) FROM leads l WHERE
      CASE s.stage WHEN 'All leads' THEN true WHEN 'Engaged+' THEN l.stage IN ('engaged','qualified','visit_booked','won')
        WHEN 'Qualified+' THEN l.stage IN ('qualified','visit_booked','won') WHEN 'Visit booked+' THEN l.stage IN ('visit_booked','won')
        ELSE l.stage='won' END)::int AS n
    FROM (VALUES (1,'All leads'),(2,'Engaged+'),(3,'Qualified+'),(4,'Visit booked+'),(5,'Won')) s(o, stage) ORDER BY s.o`);
  const demand = await q<{ body: string; n: number }>(`
    SELECT COALESCE(t->'args'->>'body_type','any') AS body, count(*)::int AS n
    FROM chat_log, jsonb_array_elements(tool_calls) t WHERE t->>'name'='search_inventory' AND created_at > ${since}
    GROUP BY 1 ORDER BY 2 DESC LIMIT 7`);
  const tools = await q<{ tool: string; n: number }>(`
    SELECT t->>'name' AS tool, count(*)::int AS n FROM chat_log, jsonb_array_elements(tool_calls) t
    WHERE created_at > ${since} GROUP BY 1 ORDER BY 2 DESC LIMIT 10`);
  const hot = await q<{ user_id: string; name: string | null; stage: string; score: number; budget_max: number | null; last_message_at: string }>(
    "SELECT user_id, name, stage, score, budget_max, last_message_at FROM leads WHERE stage NOT IN ('won','lost') ORDER BY score DESC, last_message_at DESC NULLS LAST LIMIT 6");
  const drives = await q<{ id: number; slot: string; contact_name: string; vehicle_id: string; make: string; model: string }>(
    "SELECT b.id, b.slot, b.contact_name, b.vehicle_id, v.make, v.model FROM bookings b JOIN vehicles v ON v.id=b.vehicle_id WHERE b.status='confirmed' AND b.slot > now() ORDER BY b.slot LIMIT 6");

  const conv = Number(k.leads_total) ? Math.round((Number(k.qualified) / Number(k.leads_total)) * 100) : 0;

  return (
    <>
      <PageTitle title="Overview" sub={`Last ${days} days · Apex Motors`}>
        <div className="flex gap-1 rounded-xl bg-white p-1 shadow-sm">
          {DAYS_OPTIONS.map((d) => <Link key={d} href={`/admin?days=${d}`} className={`rounded-lg px-3 py-1 text-sm ${d === days ? "bg-brand-700 text-white" : "text-slate-600"}`}>{d}d</Link>)}
        </div>
      </PageTitle>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Conversations" value={k.convos} sub={`${k.messages} messages`} />
        <Kpi label="New leads" value={k.new_leads} sub={`${k.leads_total} total`} />
        <Kpi label="Qualified rate" value={`${conv}%`} sub={`${k.qualified} qualified or better`} tone="good" />
        <Kpi label="Test drives booked" value={k.booked} sub={`${k.upcoming} upcoming`} tone="good" />
        <Kpi label="Won deals" value={k.won} />
        <Kpi label="Open callbacks" value={k.callbacks_open} tone={Number(k.callbacks_open) ? "warn" : "default"} />
        <Kpi label="Safety blocks" value={k.blocked} sub="injection / off-topic / fraud" />
        <Kpi label="AI spend (all time)" value={`$${Number(k.spend).toFixed(3)}`} sub={`avg reply ${(Number(k.latency) / 1000).toFixed(1)}s`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <LineCard title="Conversations, leads and bookings per day" data={perDay} x="day"
          series={[{ key: "conversations", name: "Conversations" }, { key: "leads", name: "New leads" }, { key: "bookings", name: "Bookings" }]} />
        <BarCard title="Lead funnel" data={funnel} x="stage" y="n" name="Leads" horizontal />
        <BarCard title="What buyers search for (body type)" data={demand} x="body" y="n" name="Searches" color={1} />
        <BarCard title="Agent tool usage" data={tools} x="tool" y="n" name="Calls" horizontal color={2} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Hottest leads</h3><Link href="/admin/leads" className="text-xs text-brand-700">All leads →</Link></div>
          <table className="mt-2 w-full"><tbody>
            {hot.map((l) => (
              <tr key={l.user_id} className="border-t border-slate-100">
                <td className="td"><Link href={`/admin/leads/${encodeURIComponent(l.user_id)}`} className="font-medium text-brand-700">{l.name || l.user_id.slice(0, 14)}</Link></td>
                <td className="td"><StageBadge stage={l.stage} /></td>
                <td className="td font-semibold">{l.score}</td>
                <td className="td">{money(l.budget_max)}</td>
                <td className="td text-xs text-slate-400">{ago(l.last_message_at)}</td>
              </tr>
            ))}
            {hot.length === 0 && <tr><td className="td text-slate-400">No leads yet</td></tr>}
          </tbody></table>
        </div>
        <div className="card p-5">
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Upcoming test drives</h3><Link href="/admin/test-drives" className="text-xs text-brand-700">All →</Link></div>
          <ul className="mt-2 divide-y divide-slate-100">
            {drives.map((d) => (
              <li key={d.id} className="flex justify-between py-2 text-sm">
                <span><b>{slot(d.slot)}</b> · {d.contact_name}</span>
                <span className="text-slate-500">{d.make} {d.model} <span className="font-mono text-xs">{d.vehicle_id}</span></span>
              </li>
            ))}
            {drives.length === 0 && <li className="py-2 text-sm text-slate-400">None scheduled</li>}
          </ul>
        </div>
      </div>
    </>
  );
}
