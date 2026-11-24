"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sparkles } from "lucide-react";

type F = { id: number; channel: string; draft: string; status: string; created_at: string };

export default function FollowupDraft({ userId, existing }: { userId: string; existing: F[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const latest = existing[0];
  const [text, setText] = useState(latest?.status === "draft" ? latest.draft : "");
  const [draftId, setDraftId] = useState<number | null>(latest?.status === "draft" ? latest.id : null);

  async function post(body: Record<string, unknown>) {
    const r = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, j: await r.json().catch(() => ({})) };
  }

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={16} className="text-accent-500" /> AI follow-up (GrowthPilot)</h3>
        <div className="flex items-center gap-2">
          <select value={channel} onChange={(e) => setChannel(e.target.value as "email" | "sms")} className="input !w-auto !py-1 text-xs">
            <option value="email">Email</option><option value="sms">SMS</option>
          </select>
          <button disabled={busy} className="btn-accent !py-1 text-xs" onClick={async () => {
            setBusy(true); setErr("");
            const { ok, j } = await post({ action: "followup_draft", user_id: userId, channel });
            setBusy(false);
            if (!ok) return setErr(j.error || "Failed");
            setText(j.draft); setDraftId(j.id); router.refresh();
          }}>{busy ? "Writing…" : "Generate draft"}</button>
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">Ava drafts a personalised message from this lead&apos;s profile, viewed cars and chat. Review it before sending (sending is simulated in this demo).</p>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      {draftId && (
        <div className="mt-3 space-y-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7} className="input font-mono text-xs" />
          <div className="flex gap-2">
            <button className="btn-primary !py-1 text-xs" onClick={async () => { await post({ action: "followup_update", id: draftId, draft: text, status: "sent" }); setDraftId(null); router.refresh(); }}>Mark as sent</button>
            <button className="btn-ghost !py-1 text-xs" onClick={async () => { await post({ action: "followup_update", id: draftId, status: "dismissed" }); setDraftId(null); router.refresh(); }}>Dismiss</button>
          </div>
        </div>
      )}
      {existing.filter((f) => f.status !== "draft").length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-slate-500">
          {existing.filter((f) => f.status !== "draft").slice(0, 3).map((f) => <li key={f.id}>{f.channel} · {f.status} · {f.draft.slice(0, 80)}…</li>)}
        </ul>
      )}
    </div>
  );
}
