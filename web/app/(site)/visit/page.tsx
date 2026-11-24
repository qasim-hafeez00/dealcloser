import { Clock, FileText, MapPin, ShieldCheck } from "lucide-react";
import AskAva from "@/components/AskAva";
import { q } from "@/lib/db";
import VisitForm from "./VisitForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visit us" };

export default async function Visit() {
  const pol = await q<{ topic: string; answer: string }>("SELECT topic, answer FROM dealer_policies").catch(() => []);
  const p = Object.fromEntries(pol.map((r) => [r.topic, r.answer]));
  const items = [
    { i: MapPin, t: "Location", d: p.location }, { i: Clock, t: "Hours", d: p.hours },
    { i: FileText, t: "What to bring", d: p.documents }, { i: ShieldCheck, t: "Warranty & returns", d: `${p.warranty ?? ""} ${p.returns ?? ""}` },
  ];
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold">Visit Apex Motors</h1>
      <p className="text-sm text-slate-500">Book a test drive with Ava in seconds, or leave your details and a sales manager will call you.</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          {items.map(({ i: I, t, d }) => (
            <div key={t} className="card flex gap-3 p-5">
              <I className="mt-0.5 shrink-0 text-brand-700" size={20} />
              <div><div className="font-semibold">{t}</div><p className="text-sm text-slate-600">{d}</p></div>
            </div>
          ))}
          <div className="card p-5">
            <div className="font-semibold">Test drive rules</div>
            <p className="text-sm text-slate-600">{p.test_drive_rules}</p>
            <div className="mt-3"><AskAva label="Book a test drive with Ava" message="I'd like to book a test drive." /></div>
          </div>
        </div>
        <VisitForm />
      </div>
    </div>
  );
}
