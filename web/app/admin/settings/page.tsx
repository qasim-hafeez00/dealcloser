import { PageTitle } from "@/components/Kpi";
import { q } from "@/lib/db";
import PolicyEditor from "./PolicyEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function Settings() {
  const pol = await q<{ topic: string; answer: string }>("SELECT topic, answer FROM dealer_policies ORDER BY topic");
  return (
    <>
      <PageTitle title="Settings" sub="Dealer policies that Ava quotes through the dealer_info tool. Edits apply to the next conversation turn." />
      <div className="grid gap-4 lg:grid-cols-2">
        {pol.map((p) => <PolicyEditor key={p.topic} topic={p.topic} answer={p.answer} />)}
      </div>
      <div className="card mt-4 p-5 text-sm text-slate-600">
        <h3 className="font-semibold text-slate-800">Agent configuration</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>Model: Claude Haiku 5.5 (low effort, adaptive thinking), max 6 model calls per turn</li>
          <li>Confirmation required for: book_test_drive, cancel_test_drive, forget_me</li>
          <li>Test drives: Mon–Sat 10:00–17:00 on the hour, up to 14 days ahead, max 3 upcoming per buyer</li>
          <li>Default financing estimate: 7.9% APR, 10% down, 60 months</li>
        </ul>
      </div>
    </>
  );
}
