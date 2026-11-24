import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarCheck, Check, Fuel, Gauge, Palette, Settings2, Users } from "lucide-react";
import AskAva from "@/components/AskAva";
import CarArt from "@/components/CarArt";
import CarCard from "@/components/CarCard";
import { q, q1 } from "@/lib/db";
import { miles, money, monthlyPayment, title, type Vehicle } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await q1<Vehicle>("SELECT * FROM vehicles WHERE id=$1", [id.toUpperCase()]).catch(() => null);
  return { title: v ? `${title(v)} (${v.id})` : "Car not found" };
}

export default async function CarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await q1<Vehicle>("SELECT * FROM vehicles WHERE id=$1", [id.toUpperCase()]);
  if (!v) notFound();
  const similar = await q<Vehicle>(
    "SELECT * FROM vehicles WHERE status='available' AND id<>$1 ORDER BY (body_type=$2) DESC, abs(price-$3) LIMIT 3", [v.id, v.body_type, v.price]);
  const est = monthlyPayment(v.price, Math.round(v.price * 0.1), 60, 7.9);
  const t = title(v);
  const specs = [
    { i: Gauge, k: "Mileage", val: miles(v.mileage) }, { i: Fuel, k: "Fuel / economy", val: `${v.fuel} · ${v.mpg ?? "n/a"}` },
    { i: Settings2, k: "Transmission", val: v.transmission }, { i: Users, k: "Seats", val: String(v.seats) },
    { i: Palette, k: "Colour", val: v.color }, { i: CalendarCheck, k: "Year", val: String(v.year) },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/inventory" className="text-sm text-slate-500 hover:underline">← Back to inventory</Link>
      <div className="mt-4 grid gap-8 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="card overflow-hidden"><CarArt body={v.body_type} color={v.color} className="h-64 w-full sm:h-80" /></div>
          <div className="card mt-6 p-6">
            <h2 className="font-semibold">About this car</h2>
            <p className="mt-2 text-slate-600">{v.description}</p>
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
              {specs.map(({ i: I, k, val }) => (
                <div key={k} className="flex items-start gap-2">
                  <I size={18} className="mt-0.5 text-brand-700" />
                  <div><div className="text-xs text-slate-500">{k}</div><div className="text-sm font-medium capitalize">{val}</div></div>
                </div>
              ))}
            </div>
            <h3 className="mt-6 font-semibold">Features</h3>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {v.features.map((f) => <li key={f} className="flex items-center gap-2 text-sm text-slate-600"><Check size={14} className="text-emerald-600" /> {f}</li>)}
            </ul>
          </div>
        </div>
        <aside className="lg:col-span-2">
          <div className="card sticky top-24 p-6">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-slate-500">{v.id}</span>
              <span className={`badge ${v.status === "available" ? "bg-emerald-100 text-emerald-700" : v.status === "reserved" ? "bg-amber-100 text-amber-800" : "bg-slate-800 text-white"}`}>
                {v.status === "available" ? "Available" : v.status === "reserved" ? "Reserved" : "Sold"}
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-bold">{t}</h1>
            <p className="text-sm capitalize text-slate-500">{v.body_type} · {miles(v.mileage)}</p>
            <div className="mt-4 text-3xl font-extrabold">{money(v.price)}</div>
            <div className="text-sm text-slate-500">≈ {money(est)}/month · 10% down, 60 months, 7.9% APR (estimate)</div>
            <div className="mt-5 space-y-2">
              {v.status === "available" ? (
                <>
                  <AskAva label="Book a test drive" message={`I'd like to book a test drive of ${v.id} (${t}). What times are free?`} className="btn-primary w-full !py-3" />
                  <AskAva label="Estimate my payment" message={`What would my monthly payment be on ${v.id}?`} className="btn-ghost w-full" />
                  <AskAva label="Ask Ava about this car" message={`Tell me more about ${v.id}. Is it a good fit for me?`} className="btn-ghost w-full" />
                </>
              ) : (
                <AskAva label="Find similar cars" message={`${v.id} isn't available. Can you suggest similar cars?`} className="btn-primary w-full !py-3" />
              )}
              <Link href={`/financing?price=${v.price}`} className="block text-center text-sm font-medium text-brand-700 hover:underline">Open the payment calculator →</Link>
            </div>
            <p className="mt-5 text-xs text-slate-400">Test drives Mon–Sat 10:00–17:00 · bring your driving licence · 90-day powertrain warranty</p>
          </div>
        </aside>
      </div>
      {similar.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-xl font-bold">Similar cars</h2>
          <div className="grid gap-5 sm:grid-cols-3">{similar.map((s) => <CarCard key={s.id} v={s} />)}</div>
        </section>
      )}
    </div>
  );
}
