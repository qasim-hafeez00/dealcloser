import Link from "next/link";
import { BarCard } from "@/components/Charts";
import Kpi, { PageTitle } from "@/components/Kpi";
import { q } from "@/lib/db";
import { when } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Safety" };

export default async function Safety() {
  const byCat = await q<{ category: string; n: number }>(`SELECT blocked_by AS category, count(*)::int n FROM chat_log
    WHERE blocked_by IN ('injection','off_topic','fraud','other_user','output_leak') GROUP BY 1 ORDER BY 2 DESC`);
  const [c] = await q<{ confirms: number; approved: number; rejected: number; errors: number }>(`SELECT
    count(*) FILTER (WHERE awaiting_confirmation)::int confirms, count(*) FILTER (WHERE confirmation='approved')::int approved,
    count(*) FILTER (WHERE confirmation='rejected')::int rejected, count(*) FILTER (WHERE error IS NOT NULL)::int errors FROM chat_log`);
  const rows = await q<{ id: number; user_id: string; user_message: string; blocked_by: string; created_at: string; source: string }>(
    "SELECT id, user_id, user_message, blocked_by, created_at, source FROM chat_log WHERE blocked_by IN ('injection','off_topic','fraud','other_user','output_leak') ORDER BY id DESC LIMIT 100");
  return (
    <>
      <PageTitle title="Safety" sub="Guard-node blocks (0 tokens), output-leak catches, and human-in-the-loop confirmations." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Blocked messages" value={byCat.reduce((a, b) => a + b.n, 0)} />
        <Kpi label="Confirmations asked" value={c.confirms} sub="book / cancel / forget" />
        <Kpi label="Approved / declined" value={`${c.approved} / ${c.rejected}`} />
        <Kpi label="Errors handled" value={c.errors} tone={c.errors ? "warn" : "default"} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <BarCard title="Blocks by category" data={byCat} x="category" y="n" name="Blocked" color={3} />
        <div className="card overflow-x-auto p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold">Recent blocked messages</h3>
          <table className="mt-2 w-full"><tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="td whitespace-nowrap text-xs text-slate-400">{when(r.created_at)}</td>
                <td className="td"><span className="badge bg-red-100 text-red-700">{r.blocked_by}</span></td>
                <td className="td">{r.user_message.slice(0, 140)}</td>
                <td className="td text-xs"><Link href={`/admin/leads/${encodeURIComponent(r.user_id)}`} className="text-brand-700">{r.user_id.slice(0, 12)}</Link> · {r.source}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className="td text-slate-400">Nothing blocked yet.</td></tr>}
          </tbody></table>
        </div>
      </div>
    </>
  );
}
