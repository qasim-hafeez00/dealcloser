"use client";
import { useState } from "react";

export default function PolicyEditor({ topic, answer }: { topic: string; answer: string }) {
  const [v, setV] = useState(answer);
  const [msg, setMsg] = useState("");
  return (
    <div className="card p-5">
      <label className="label">{topic.replace(/_/g, " ")}</label>
      <textarea value={v} onChange={(e) => setV(e.target.value)} rows={3} maxLength={1000} className="input" />
      <div className="mt-2 flex items-center gap-3">
        <button className="btn-primary !py-1 text-xs" disabled={v === answer && !msg} onClick={async () => {
          const r = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "policy_update", topic, answer: v }) });
          setMsg(r.ok ? "Saved" : "Failed");
        }}>Save</button>
        {msg && <span className="text-xs text-slate-500">{msg}</span>}
      </div>
    </div>
  );
}
