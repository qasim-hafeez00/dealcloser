import { BarCard, LineCard } from "@/components/Charts";
import Kpi, { PageTitle } from "@/components/Kpi";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Usage & cost" };

const CAP = 1.6;
const COST = "(COALESCE(sum(tokens_in - cache_read),0)*0.10/1e6 + COALESCE(sum(cache_read),0)*0.01/1e6 + COALESCE(sum(tokens_out),0)*0.50/1e6)";

export default async function Usage() {
  const [t] = await q<Record<string, number>>(`SELECT ${COST}::float AS spend, count(*)::int turns,
    count(*) FILTER (WHERE tokens_in > 0)::int llm_turns, COALESCE(sum(tokens_in),0)::int tin, COALESCE(sum(tokens_out),0)::int tout,
    COALESCE(sum(cache_read),0)::int cache, COALESCE(avg(latency_ms) FILTER (WHERE tokens_in>0),0)::int lat,
    COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE tokens_in>0),0)::int p95,
    COALESCE(avg(model_calls) FILTER (WHERE tokens_in>0),0)::float calls FROM chat_log`);
  const [f] = await q<{ spend: number }>("SELECT (COALESCE(sum(tokens_in),0)*0.10/1e6 + COALESCE(sum(tokens_out),0)*0.50/1e6)::float spend FROM followups");
  const daily = await q<{ day: string; turns: number; cost_cents: number }>(`
    SELECT to_char(created_at::date, 'DD Mon') AS day, count(*)::int turns, round((${COST} * 100)::numeric, 3)::float AS cost_cents
    FROM chat_log WHERE created_at > now() - interval '14 days' GROUP BY created_at::date ORDER BY created_at::date`);
  const lat = await q<{ bucket: string; n: number }>(`
    SELECT b.bucket, count(c.id)::int n FROM (VALUES (1,'<2s',0,2000),(2,'2-4s',2000,4000),(3,'4-8s',4000,8000),(4,'8-15s',8000,15000),(5,'>15s',15000,1000000)) b(o,bucket,lo,hi)
    LEFT JOIN chat_log c ON c.latency_ms >= b.lo AND c.latency_ms < b.hi AND c.tokens_in > 0 GROUP BY b.o, b.bucket ORDER BY b.o`);
  const spend = Number(t.spend) + Number(f.spend);
  const pct = Math.min(100, (spend / CAP) * 100);
  const perTurn = t.llm_turns ? Number(t.spend) / t.llm_turns : 0;
  return (
    <>
      <PageTitle title="Usage & cost" sub="Claude Haiku 5.5 ($0.10 / $0.50 per million tokens in/out). The agent switches to a safe fallback message at the spend cap." />
      <div className="card mb-4 p-5">
        <div className="flex justify-between text-sm"><span className="font-semibold">Spend vs cap</span><span>${spend.toFixed(4)} / ${CAP.toFixed(2)}</span></div>
        <div className="mt-2 h-3 rounded-full bg-slate-100"><div className={`h-3 rounded-full ${pct > 80 ? "bg-red-500" : pct > 50 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.max(pct, 1)}%` }} /></div>
        <p className="mt-1 text-xs text-slate-400">{pct.toFixed(1)}% of the cap used (key limit $2.00).</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Turns" value={t.turns} sub={`${t.llm_turns} used the LLM`} />
        <Kpi label="Cost per LLM turn" value={`$${perTurn.toFixed(5)}`} tone="good" />
        <Kpi label="Tokens in / out" value={`${(t.tin / 1000).toFixed(1)}k / ${(t.tout / 1000).toFixed(1)}k`} sub={`${(t.cache / 1000).toFixed(1)}k cache reads`} />
        <Kpi label="Latency avg / p95" value={`${(t.lat / 1000).toFixed(1)}s / ${(t.p95 / 1000).toFixed(1)}s`} sub={`${Number(t.calls).toFixed(1)} model calls per turn`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <LineCard title="Daily cost (US cents) and turns" data={daily} x="day" series={[{ key: "cost_cents", name: "Cost (¢)" }, { key: "turns", name: "Turns" }]} />
        <BarCard title="Reply latency distribution" data={lat} x="bucket" y="n" name="Turns" color={4} />
      </div>
    </>
  );
}
