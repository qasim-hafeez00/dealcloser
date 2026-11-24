export default function Kpi({ label, value, sub, tone = "default" }: { label: string; value: string | number; sub?: string; tone?: "default" | "good" | "warn" }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-slate-900"}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

export function StageBadge({ stage }: { stage: string }) {
  const tone: Record<string, string> = {
    new: "bg-slate-100 text-slate-700", engaged: "bg-sky-100 text-sky-700", qualified: "bg-violet-100 text-violet-700",
    visit_booked: "bg-amber-100 text-amber-800", won: "bg-emerald-100 text-emerald-700", lost: "bg-red-100 text-red-700",
  };
  return <span className={`badge ${tone[stage] ?? tone.new}`}>{stage.replace("_", " ")}</span>;
}

export function PageTitle({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-bold">{title}</h1>{sub && <p className="text-sm text-slate-500">{sub}</p>}</div>
      {children}
    </div>
  );
}
