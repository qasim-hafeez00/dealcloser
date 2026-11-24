import Link from "next/link";
import PostButton from "@/components/PostButton";
import AskAva from "@/components/AskAva";
import { requireUser } from "@/lib/auth";
import { agentInternal } from "@/lib/agent";
import { q } from "@/lib/db";
import { money, slot, when } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "My account" };

type Mem = { profile: Record<string, unknown>; notes: { text: string }[]; viewed: string[] };
type Booking = { id: number; vehicle_id: string; slot: string; status: string; year: number; make: string; model: string };

const LABELS: Record<string, string> = { budget_max: "Budget", body_type: "Body type", fuel: "Fuel", min_seats: "Seats needed",
  timeline: "Timeline", financing: "Payment", trade_in: "Trade-in", name: "Name", phone: "Phone", email: "Email" };

export default async function Account() {
  const s = await requireUser("/account");
  const [mem, bookings, chats] = await Promise.all([
    agentInternal<Mem>(`/internal/memory/${encodeURIComponent(s.sub)}`),
    q<Booking>(`SELECT b.id, b.vehicle_id, b.slot, b.status, v.year, v.make, v.model FROM bookings b JOIN vehicles v ON v.id=b.vehicle_id
                WHERE b.user_id=$1 ORDER BY b.slot DESC`, [s.sub]),
    q<{ thread_id: string; user_message: string; reply: string; created_at: string }>(
      "SELECT thread_id, user_message, reply, created_at FROM chat_log WHERE user_id=$1 ORDER BY id DESC LIMIT 20", [s.sub]),
  ]);
  const now = Date.now();
  const upcoming = bookings.filter((b) => b.status === "confirmed" && new Date(b.slot).getTime() > now).reverse();
  const past = bookings.filter((b) => !upcoming.includes(b));
  const profile = Object.entries(mem?.profile ?? {}).filter(([k, v]) => k !== "updated_at" && v != null && v !== "");

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Hi, {s.name.split(" ")[0]}</h1>
          <p className="text-sm text-slate-500">{s.email}</p>
        </div>
        <PostButton url="/api/auth" body={{ action: "logout" }} label="Log out" redirectTo="/" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="font-semibold">Upcoming test drives</h2>
          {upcoming.length === 0 ? (
            <div className="mt-3 text-sm text-slate-500">No test drives booked. <AskAva label="Book one with Ava" message="I'd like to book a test drive." className="ml-1 font-semibold text-brand-700" /></div>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {upcoming.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                  <div>
                    <div className="text-sm font-semibold">{b.year} {b.make} {b.model} <Link href={`/inventory/${b.vehicle_id}`} className="font-mono text-xs text-brand-700">{b.vehicle_id}</Link></div>
                    <div className="text-xs text-slate-500">TD-{b.id} · {slot(b.slot)} (dealer time)</div>
                  </div>
                  <PostButton url="/api/account" body={{ action: "cancel_booking", booking_id: b.id }} label="Cancel" confirm={`Cancel test drive TD-${b.id}?`} />
                </li>
              ))}
            </ul>
          )}
          {past.length > 0 && (
            <>
              <h3 className="mt-5 text-xs font-semibold uppercase text-slate-400">History</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-500">
                {past.slice(0, 5).map((b) => <li key={b.id}>TD-{b.id} · {b.make} {b.model} · {slot(b.slot)} · <span className="capitalize">{b.status.replace("_", " ")}</span></li>)}
              </ul>
            </>
          )}
        </section>

        <section className="card p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">What Ava remembers about you</h2>
            {mem && (profile.length > 0 || mem.notes.length > 0) && (
              <PostButton url="/api/account" body={{ action: "forget_memory" }} label="Forget all" confirm="Delete everything Ava remembers about you? Bookings are kept." className="btn-ghost !py-1 !text-xs" />
            )}
          </div>
          {!mem ? <p className="mt-3 text-sm text-slate-500">Memory is unavailable right now.</p> : profile.length === 0 && mem.notes.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Nothing yet. Tell Ava your budget and needs and she&apos;ll remember them for next time.</p>
          ) : (
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              {profile.map(([k, v]) => (
                <div key={k}><dt className="text-xs text-slate-400">{LABELS[k] ?? k}</dt><dd className="font-medium capitalize">{k === "budget_max" ? money(Number(v)) : String(v).replace(/_/g, " ")}</dd></div>
              ))}
              {mem.notes.length > 0 && <div className="col-span-2"><dt className="text-xs text-slate-400">Notes</dt>{mem.notes.map((n, i) => <dd key={i}>• {n.text}</dd>)}</div>}
              {mem.viewed.length > 0 && <div className="col-span-2"><dt className="text-xs text-slate-400">Recently viewed</dt><dd className="flex flex-wrap gap-2">{mem.viewed.map((v) => <Link key={v} href={`/inventory/${v}`} className="font-mono text-xs text-brand-700">{v}</Link>)}</dd></div>}
            </dl>
          )}
        </section>
      </div>

      <section className="card mt-6 p-6">
        <h2 className="font-semibold">Recent conversations</h2>
        {chats.length === 0 ? <p className="mt-3 text-sm text-slate-500">No chats yet.</p> : (
          <ul className="mt-3 space-y-3">
            {chats.map((c, i) => (
              <li key={i} className="rounded-xl bg-slate-50 p-3 text-sm">
                <div className="text-xs text-slate-400">{when(c.created_at)}</div>
                <div className="font-medium">You: {c.user_message}</div>
                <div className="text-slate-600">Ava: {c.reply.slice(0, 240)}{c.reply.length > 240 ? "…" : ""}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card mt-6 border-red-200 p-6">
        <h2 className="font-semibold text-red-700">Delete account</h2>
        <p className="mt-1 text-sm text-slate-500">Removes your account, saved preferences, chat history and callback requests, and cancels upcoming test drives. This can&apos;t be undone.</p>
        <div className="mt-3"><PostButton url="/api/account" body={{ action: "delete_account" }} label="Delete my account" className="btn !bg-red-600 text-white hover:!bg-red-700" confirm="Permanently delete your account and data?" /></div>
      </section>
    </div>
  );
}
