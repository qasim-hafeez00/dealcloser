"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { STAGES, stageLabel } from "@/lib/format";

export default function LeadEditor({ userId, stage, notes }: { userId: string; stage: string; notes: string }) {
  const router = useRouter();
  const [s, setS] = useState(stage);
  const [n, setN] = useState(notes);
  const [msg, setMsg] = useState("");
  return (
    <div className="card space-y-3 p-5">
      <h3 className="text-sm font-semibold">Manage lead</h3>
      <div>
        <label className="label">Stage</label>
        <select value={s} onChange={(e) => setS(e.target.value)} className="input">
          {STAGES.map((x) => <option key={x} value={x}>{stageLabel[x]}</option>)}
        </select>
        <p className="mt-1 text-xs text-slate-400">Won/Lost are set by staff only; the agent never overrides them.</p>
      </div>
      <div>
        <label className="label">Internal notes</label>
        <textarea value={n} onChange={(e) => setN(e.target.value)} rows={3} maxLength={2000} className="input" placeholder="e.g. prefers WhatsApp, coming with spouse" />
      </div>
      <button className="btn-primary w-full" onClick={async () => {
        const r = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "lead_update", user_id: userId, stage: s, admin_notes: n }) });
        setMsg(r.ok ? "Saved" : "Failed to save");
        router.refresh();
      }}>Save</button>
      {msg && <p className="text-center text-xs text-slate-500">{msg}</p>}
    </div>
  );
}
