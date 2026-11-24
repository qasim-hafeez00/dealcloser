"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="card mx-auto mt-10 max-w-md space-y-4 p-8"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setBusy(true); setErr("");
        const r = await fetch("/api/auth", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: mode, name: f.get("name"), email: f.get("email"), password: f.get("password"),
                                 remember: f.get("remember") === "on", next }),
        }).catch(() => null);
        const j = r ? await r.json().catch(() => ({})) : { error: "Network error" };
        setBusy(false);
        if (!r || !r.ok) return setErr(j.error || "Something went wrong");
        router.push(j.next || "/account");
        router.refresh();
      }}
    >
      <div>
        <h1 className="text-2xl font-bold">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="text-sm text-slate-500">
          {mode === "login" ? "Log in to see your test drives and saved preferences." : "Save your preferences, track test drives, and pick up chats on any device."}
        </p>
      </div>
      {mode === "signup" && (
        <div><label className="label" htmlFor="name">Name</label><input id="name" name="name" required maxLength={80} className="input" autoComplete="name" /></div>
      )}
      <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required className="input" autoComplete="email" /></div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" required minLength={mode === "signup" ? 8 : 1} className="input"
          autoComplete={mode === "login" ? "current-password" : "new-password"} />
        {mode === "signup" && <p className="mt-1 text-xs text-slate-400">At least 8 characters.</p>}
      </div>
      {mode === "login" && <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="remember" /> Remember me for 30 days</label>}
      {err && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700" role="alert">{err}</p>}
      <button disabled={busy} className="btn-primary w-full !py-2.5">{busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}</button>
      <p className="text-center text-sm text-slate-500">
        {mode === "login" ? <>New here? <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-brand-700">Create an account</Link></>
          : <>Already have an account? <Link href="/login" className="font-semibold text-brand-700">Log in</Link></>}
      </p>
      {mode === "signup" && <p className="text-center text-xs text-slate-400">Your chats as a guest on this device are added to your new account.</p>}
    </form>
  );
}
