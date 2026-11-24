import Link from "next/link";
import PostButton from "@/components/PostButton";
import { PageTitle } from "@/components/Kpi";
import { q } from "@/lib/db";
import { ago } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Callbacks" };

export default async function Callbacks() {
  const rows = await q<{ id: number; user_id: string; reason: string; preferred_time: string | null; contact: string | null; source: string; status: string; created_at: string; name: string | null }>(
    "SELECT c.*, l.name FROM callbacks c LEFT JOIN leads l ON l.user_id=c.user_id ORDER BY (c.status='open') DESC, c.id DESC LIMIT 200");
  return (
    <>
      <PageTitle title="Callback requests" sub="Buyers who asked for a human (discounts, special requests) via Ava or the website form." />
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead className="border-b border-slate-200 bg-slate-50"><tr>{["ID", "Buyer", "Reason", "Contact", "Preferred", "Source", "Status", ""].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-slate-100">
                <td className="td font-mono text-xs">CB-{c.id}<div className="text-[11px] text-slate-400">{ago(c.created_at)}</div></td>
                <td className="td"><Link href={`/admin/leads/${encodeURIComponent(c.user_id)}`} className="text-brand-700">{c.name || c.user_id.slice(0, 14)}</Link></td>
                <td className="td max-w-xs">{c.reason}</td>
                <td className="td">{c.contact ?? "–"}</td>
                <td className="td">{c.preferred_time ?? "–"}</td>
                <td className="td">{c.source === "agent" ? "Ava" : "Website form"}</td>
                <td className="td"><span className={`badge ${c.status === "open" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-500"}`}>{c.status}</span></td>
                <td className="td whitespace-nowrap">
                  {c.status === "open" && <>
                    <PostButton url="/api/admin" body={{ action: "callback_status", id: c.id, status: "done" }} label="Done" className="btn-ghost !px-2 !py-1 !text-xs" />{" "}
                    <PostButton url="/api/admin" body={{ action: "callback_status", id: c.id, status: "dismissed" }} label="Dismiss" className="btn-ghost !px-2 !py-1 !text-xs" />
                  </>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="td py-10 text-center text-slate-400">No callback requests.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
