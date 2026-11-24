"use client";
import { useState } from "react";

export default function VisitForm() {
  const [state, setState] = useState<{ ok?: string; err?: string; busy?: boolean }>({});
  return (
    <form
      className="card h-fit space-y-4 p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = Object.fromEntries(new FormData(form));
        setState({ busy: true });
        const r = await fetch("/api/visit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }).catch(() => null);
        const j = r ? await r.json().catch(() => ({})) : {};
        if (r?.ok) { setState({ ok: `Thanks! Request ${j.id} received. A sales manager will contact you soon.` }); form.reset(); }
        else setState({ err: j.error || "Couldn't send. Please try again." });
      }}
    >
      <h2 className="text-lg font-semibold">Request a call back</h2>
      <div><label className="label">Name</label><input name="name" required maxLength={80} className="input" /></div>
      <div><label className="label">Phone or email</label><input name="contact" required maxLength={120} className="input" /></div>
      <div><label className="label">Best time to call (optional)</label><input name="preferred_time" maxLength={100} placeholder="e.g. weekday evenings" className="input" /></div>
      <div><label className="label">How can we help?</label><textarea name="message" required maxLength={500} rows={4} className="input" placeholder="I'm interested in the RAV4 and want to discuss financing…" /></div>
      {state.ok && <p className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-700">{state.ok}</p>}
      {state.err && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{state.err}</p>}
      <button disabled={state.busy} className="btn-primary w-full">{state.busy ? "Sending…" : "Send request"}</button>
    </form>
  );
}
