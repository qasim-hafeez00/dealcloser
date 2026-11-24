import Link from "next/link";
import PostButton from "@/components/PostButton";
import { PageTitle } from "@/components/Kpi";
import { q } from "@/lib/db";
import { miles, money, title, type Vehicle } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inventory" };

export default async function AdminInventory() {
  const cars = await q<Vehicle & { interest: number; drives: number }>(`
    SELECT v.*,
      (SELECT count(*) FROM chat_log c, jsonb_array_elements(c.tool_calls) t
        WHERE t->'args'->>'vehicle_id' = v.id OR (t->'args'->'vehicle_ids') ? v.id OR c.reply LIKE '%' || v.id || '%')::int AS interest,
      (SELECT count(*) FROM bookings b WHERE b.vehicle_id=v.id)::int AS drives
    FROM vehicles v ORDER BY v.id`);
  const ranked = [...cars].sort((a, b) => b.interest + b.drives * 3 - (a.interest + a.drives * 3)).slice(0, 5);
  return (
    <>
      <PageTitle title="Inventory" sub="Live stock used by Ava's tools. Changes apply to the agent immediately." />
      <div className="card mb-4 p-5">
        <h3 className="text-sm font-semibold">Most wanted (chat mentions + test drives)</h3>
        <ol className="mt-2 grid gap-2 text-sm sm:grid-cols-5">
          {ranked.map((v, i) => <li key={v.id} className="rounded-xl bg-slate-50 p-3"><div className="text-xs text-slate-400">#{i + 1} · {v.id}</div><div className="font-semibold">{v.make} {v.model}</div><div className="text-xs text-slate-500">{v.interest} mentions · {v.drives} drives</div></li>)}
        </ol>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead className="border-b border-slate-200 bg-slate-50"><tr>{["ID", "Car", "Price", "Miles", "Body / fuel", "Interest", "Status", "Actions"].map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
          <tbody>
            {cars.map((v) => (
              <tr key={v.id} className="border-b border-slate-100">
                <td className="td font-mono text-xs">{v.id}</td>
                <td className="td"><Link href={`/inventory/${v.id}`} className="font-medium text-brand-700">{title(v)}</Link>{v.featured && <span className="badge ml-1 bg-brand-50 text-brand-700">featured</span>}</td>
                <td className="td">{money(v.price)}</td>
                <td className="td">{miles(v.mileage)}</td>
                <td className="td capitalize">{v.body_type} · {v.fuel}</td>
                <td className="td">{v.interest} / {v.drives} TD</td>
                <td className="td"><span className={`badge ${v.status === "available" ? "bg-emerald-100 text-emerald-700" : v.status === "reserved" ? "bg-amber-100 text-amber-800" : "bg-slate-800 text-white"}`}>{v.status}</span></td>
                <td className="td whitespace-nowrap">
                  {(["available", "reserved", "sold"] as const).filter((s) => s !== v.status).map((s) => (
                    <PostButton key={s} url="/api/admin" body={{ action: "vehicle_update", id: v.id, status: s }} label={`Mark ${s}`} className="btn-ghost mr-1 !px-2 !py-0.5 !text-xs" />
                  ))}
                  <PostButton url="/api/admin" body={{ action: "vehicle_update", id: v.id, featured: !v.featured }} label={v.featured ? "Unfeature" : "Feature"} className="btn-ghost !px-2 !py-0.5 !text-xs" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
