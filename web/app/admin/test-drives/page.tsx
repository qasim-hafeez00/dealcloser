import Link from "next/link";
import PostButton from "@/components/PostButton";
import { PageTitle } from "@/components/Kpi";
import { q } from "@/lib/db";
import { slot, TZ } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Test drives" };

type B = { id: number; user_id: string; vehicle_id: string; slot: string; status: string; contact_name: string; phone: string | null; make: string; model: string; year: number };

export default async function TestDrives() {
  const rows = await q<B>(`SELECT b.*, v.make, v.model, v.year FROM bookings b JOIN vehicles v ON v.id=b.vehicle_id
    WHERE b.slot > now() - interval '30 days' ORDER BY b.slot`);
  const now = new Date();
  const upcoming = rows.filter((b) => new Date(b.slot) > now);
  const past = rows.filter((b) => new Date(b.slot) <= now).reverse();
  const byDay = new Map<string, B[]>();
  for (const b of upcoming) {
    const d = new Date(b.slot).toLocaleDateString("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "short" });
    byDay.set(d, [...(byDay.get(d) ?? []), b]);
  }
  const tone: Record<string, string> = { confirmed: "bg-emerald-100 text-emerald-700", cancelled: "bg-slate-100 text-slate-500", completed: "bg-sky-100 text-sky-700", no_show: "bg-red-100 text-red-700" };
  return (
    <>
      <PageTitle title="Test drives" sub="Schedule (dealer time, Asia/Karachi). Mark outcomes after each drive." />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {[...byDay.entries()].map(([day, list]) => (
            <div key={day} className="card p-5">
              <h3 className="text-sm font-semibold">{day}</h3>
              <ul className="mt-2 divide-y divide-slate-100">
                {list.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <div>
                      <b>{new Date(b.slot).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" })}</b> · {b.year} {b.make} {b.model} <span className="font-mono text-xs text-slate-400">{b.vehicle_id}</span>
                      <div className="text-xs text-slate-500">TD-{b.id} · <Link href={`/admin/leads/${encodeURIComponent(b.user_id)}`} className="text-brand-700">{b.contact_name}</Link>{b.phone ? ` · ${b.phone}` : ""}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`badge ${tone[b.status]}`}>{b.status.replace("_", " ")}</span>
                      {b.status === "confirmed" && <PostButton url="/api/admin" body={{ action: "booking_status", id: b.id, status: "cancelled" }} label="Cancel" className="btn-ghost !px-2 !py-1 !text-xs" confirm={`Cancel TD-${b.id}?`} />}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {upcoming.length === 0 && <div className="card p-10 text-center text-sm text-slate-400">No upcoming test drives.</div>}
        </div>
        <div className="card h-fit p-5">
          <h3 className="text-sm font-semibold">Recent (last 30 days)</h3>
          <ul className="mt-2 space-y-3">
            {past.map((b) => (
              <li key={b.id} className="text-sm">
                <div>TD-{b.id} · {b.make} {b.model} · {b.contact_name}</div>
                <div className="text-xs text-slate-500">{slot(b.slot)} · <span className={`badge ${tone[b.status]}`}>{b.status.replace("_", " ")}</span></div>
                {b.status === "confirmed" && (
                  <div className="mt-1 flex gap-1">
                    <PostButton url="/api/admin" body={{ action: "booking_status", id: b.id, status: "completed" }} label="Completed" className="btn-ghost !px-2 !py-0.5 !text-xs" />
                    <PostButton url="/api/admin" body={{ action: "booking_status", id: b.id, status: "no_show" }} label="No-show" className="btn-ghost !px-2 !py-0.5 !text-xs" />
                  </div>
                )}
              </li>
            ))}
            {past.length === 0 && <li className="text-sm text-slate-400">Nothing yet.</li>}
          </ul>
        </div>
      </div>
    </>
  );
}
