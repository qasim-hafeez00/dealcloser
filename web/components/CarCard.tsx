import Link from "next/link";
import CarArt from "./CarArt";
import { money, miles, title, type Vehicle } from "@/lib/format";
import { monthlyPayment } from "@/lib/format";

export default function CarCard({ v }: { v: Vehicle }) {
  const est = monthlyPayment(v.price, Math.round(v.price * 0.1), 60, 7.9);
  return (
    <Link href={`/inventory/${v.id}`} className="card group overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative">
        <CarArt body={v.body_type} color={v.color} className="h-36 w-full" />
        {v.status !== "available" && (
          <span className={`badge absolute left-3 top-3 ${v.status === "sold" ? "bg-slate-800 text-white" : "bg-amber-100 text-amber-800"}`}>
            {v.status === "sold" ? "Sold" : "Reserved"}
          </span>
        )}
        {v.featured && v.status === "available" && <span className="badge absolute left-3 top-3 bg-brand-700 text-white">Featured</span>}
        <span className="absolute right-3 top-3 rounded-md bg-white/80 px-1.5 text-[11px] font-mono text-slate-600">{v.id}</span>
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-slate-900 group-hover:text-brand-700">{title(v)}</h3>
        <p className="mt-0.5 text-xs capitalize text-slate-500">
          {v.body_type} · {miles(v.mileage)} · {v.fuel} · {v.seats} seats
        </p>
        <div className="mt-3 flex items-end justify-between">
          <span className="text-xl font-bold text-slate-900">{money(v.price)}</span>
          <span className="text-xs text-slate-500">≈ {money(est)}/mo</span>
        </div>
      </div>
    </Link>
  );
}
