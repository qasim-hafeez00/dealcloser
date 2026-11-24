import Link from "next/link";
import AskAva from "@/components/AskAva";
import CarCard from "@/components/CarCard";
import { q } from "@/lib/db";
import type { Vehicle } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inventory" };

const BODIES = ["sedan", "suv", "hatchback", "pickup", "minivan", "coupe"];
const FUELS = ["gasoline", "hybrid", "electric"];
const SORTS: Record<string, string> = { price_asc: "price ASC", price_desc: "price DESC", newest: "year DESC, price ASC", mileage: "mileage ASC" };

type SP = Promise<Record<string, string | undefined>>;

export default async function Inventory({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const where: string[] = [];
  const args: unknown[] = [];
  const add = (sql: string, v: unknown) => { args.push(v); where.push(sql.replaceAll("?", `$${args.length}`)); };
  if (sp.status !== "all") where.push("status='available'");
  if (sp.body && BODIES.includes(sp.body)) add("body_type=?", sp.body);
  if (sp.fuel && FUELS.includes(sp.fuel)) add("fuel=?", sp.fuel);
  if (sp.max && Number(sp.max) > 0) add("price<=?", Number(sp.max));
  if (sp.seats && Number(sp.seats) > 0) add("seats>=?", Number(sp.seats));
  if (sp.q) add("(make ILIKE ? OR model ILIKE ?)", `%${sp.q.slice(0, 40)}%`);
  const order = SORTS[sp.sort || "price_asc"] || SORTS.price_asc;
  let cars: Vehicle[] = [];
  try {
    cars = await q<Vehicle>(`SELECT * FROM vehicles ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ${order}`, args);
  } catch { /* show empty */ }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Our inventory</h1>
          <p className="text-sm text-slate-500">{cars.length} car{cars.length === 1 ? "" : "s"} · every car inspected, 90-day warranty</p>
        </div>
        <AskAva label="Not sure? Ask Ava" message="Can you help me choose a car?" className="btn-ghost" />
      </div>

      <form className="card mt-6 grid gap-3 p-4 sm:grid-cols-6" method="get">
        <div className="sm:col-span-2">
          <label className="label">Search</label>
          <input name="q" defaultValue={sp.q} placeholder="Make or model" className="input" />
        </div>
        <div>
          <label className="label">Body</label>
          <select name="body" defaultValue={sp.body || ""} className="input">
            <option value="">Any</option>{BODIES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Fuel</label>
          <select name="fuel" defaultValue={sp.fuel || ""} className="input">
            <option value="">Any</option>{FUELS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Max price</label>
          <select name="max" defaultValue={sp.max || ""} className="input">
            <option value="">Any</option>{[15000, 20000, 25000, 30000, 35000, 40000].map((p) => <option key={p} value={p}>${p.toLocaleString()}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Seats</label>
          <select name="seats" defaultValue={sp.seats || ""} className="input">
            <option value="">Any</option><option value="5">5+</option><option value="7">7+</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-6">
          <select name="sort" defaultValue={sp.sort || "price_asc"} className="input !w-auto">
            <option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option>
            <option value="newest">Newest</option><option value="mileage">Lowest mileage</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="status" value="all" defaultChecked={sp.status === "all"} /> Include reserved/sold
          </label>
          <button className="btn-primary ml-auto">Apply filters</button>
          <Link href="/inventory" className="text-sm text-slate-500 hover:underline">Reset</Link>
        </div>
      </form>

      {cars.length === 0 ? (
        <div className="card mt-6 p-10 text-center">
          <p className="font-semibold">No cars match these filters.</p>
          <p className="mt-1 text-sm text-slate-500">Try a higher budget or fewer filters, or let Ava find the closest options.</p>
          <div className="mt-4"><AskAva label="Ask Ava for alternatives" message="Nothing matched my filters. What are the closest options?" /></div>
        </div>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cars.map((v) => <CarCard key={v.id} v={v} />)}
        </div>
      )}
    </div>
  );
}
