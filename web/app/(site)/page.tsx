import Link from "next/link";
import { CalendarCheck, Calculator, Clock, Search, ShieldCheck, Sparkles } from "lucide-react";
import AskAva from "@/components/AskAva";
import CarCard from "@/components/CarCard";
import { q } from "@/lib/db";
import type { Vehicle } from "@/lib/format";

export const dynamic = "force-dynamic";

const PROMPTS = [
  "I need a 7-seater for my family under $35k",
  "Show me hybrids under $30,000",
  "What's the cheapest EV you have?",
  "Book a test drive this Saturday",
];

export default async function Home() {
  let featured: Vehicle[] = [];
  let stats = { cars: 24, from: 9900 };
  try {
    featured = await q<Vehicle>("SELECT * FROM vehicles WHERE featured AND status='available' ORDER BY price LIMIT 6");
    const s = await q<{ n: string; m: number }>("SELECT count(*) n, min(price) m FROM vehicles WHERE status='available'");
    stats = { cars: Number(s[0].n), from: s[0].m };
  } catch { /* render without DB */ }

  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-900 via-brand-700 to-brand-500 text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:py-20 lg:grid-cols-2">
          <div>
            <span className="badge bg-white/15 text-white"><Sparkles size={12} className="mr-1" /> Open 24/7 with Ava, our AI assistant</span>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight sm:text-5xl">Find your next car in one conversation.</h1>
            <p className="mt-4 max-w-xl text-lg text-white/80">
              Tell Ava what you need. She searches our live inventory, works out your monthly payment, values your trade-in and books your test drive, any time of day.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <AskAva label="Chat with Ava" className="btn-accent !px-5 !py-3 !text-base" />
              <Link href="/inventory" className="btn !border !border-white/40 !px-5 !py-3 !text-base text-white hover:bg-white/10">
                <Search size={16} /> Browse {stats.cars} cars
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {PROMPTS.map((p) => <AskAva key={p} message={p} label={p} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20" />)}
            </div>
          </div>
          <div className="hidden lg:block">
            <div className="rounded-3xl bg-white/10 p-5 shadow-2xl backdrop-blur">
              <div className="space-y-3 text-sm">
                <div className="ml-auto w-fit max-w-[80%] rounded-2xl rounded-tr-sm bg-white px-3 py-2 text-slate-800">Family car, about $35k, we need 7 seats</div>
                <div className="flex gap-1">
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px]">Saved preferences</span>
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px]">Searched inventory</span>
                </div>
                <div className="w-fit max-w-[85%] rounded-2xl rounded-tl-sm bg-white/90 px-3 py-2 text-slate-800">
                  Great fits: <b>APX-121</b> Honda Odyssey ($31,500, 8 seats), <b>APX-106</b> Toyota Highlander ($33,900, 7 seats). Want a test drive this week?
                </div>
                <div className="ml-auto w-fit rounded-2xl rounded-tr-sm bg-white px-3 py-2 text-slate-800">Thursday 11am, I&apos;m Sara</div>
                <div className="w-fit rounded-2xl rounded-tl-sm border border-amber-300 bg-amber-50 px-3 py-2 text-slate-800">Please confirm: test drive of the 2021 Honda Odyssey EX (APX-121) on Thu 11:00 for Sara.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-4 sm:grid-cols-4">
          {[
            { icon: Search, t: "Live inventory", d: `${stats.cars} inspected cars from $${stats.from.toLocaleString()}` },
            { icon: Calculator, t: "Instant estimates", d: "Monthly payments and trade-in values in seconds" },
            { icon: CalendarCheck, t: "Book test drives", d: "Mon–Sat, confirmed instantly with your OK" },
            { icon: ShieldCheck, t: "Peace of mind", d: "90-day warranty + 7-day money-back guarantee" },
          ].map(({ icon: I, t, d }) => (
            <div key={t} className="card p-5">
              <I className="text-brand-700" size={22} />
              <div className="mt-3 font-semibold">{t}</div>
              <div className="text-sm text-slate-500">{d}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-12">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold">Featured cars</h2>
            <p className="text-sm text-slate-500">Hand-picked this week. Ask Ava about any of them.</p>
          </div>
          <Link href="/inventory" className="text-sm font-semibold text-brand-700 hover:underline">See all →</Link>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((v) => <CarCard key={v.id} v={v} />)}
        </div>
      </section>

      <section className="bg-white py-12">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-bold">How it works</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {[
              ["1", "Tell Ava what you need", "Budget, seats, fuel, timeline. She remembers it for next time."],
              ["2", "Compare real options", "Live prices, specs and payment estimates, never made-up numbers."],
              ["3", "Book and visit", "Pick a slot, confirm, and we'll have the car ready with a sales rep."],
            ].map(([n, t, d]) => (
              <div key={n} className="text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-700 font-bold text-white">{n}</div>
                <div className="mt-3 font-semibold">{t}</div>
                <p className="text-sm text-slate-500">{d}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex items-center justify-center gap-2 text-sm text-slate-500">
            <Clock size={14} /> Ava replies in seconds, day or night.
          </div>
        </div>
      </section>
    </>
  );
}
