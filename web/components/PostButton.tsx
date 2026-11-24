"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Posts a JSON action to an API route, then refreshes the server-rendered page. */
export default function PostButton({
  url, body, label, className = "btn-ghost", confirm: confirmText, redirectTo,
}: { url: string; body: Record<string, unknown>; label: string; className?: string; confirm?: string; redirectTo?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        disabled={busy}
        className={className}
        onClick={async () => {
          if (confirmText && !window.confirm(confirmText)) return;
          setBusy(true); setErr("");
          try {
            const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) setErr(j.error || "Something went wrong");
            else if (redirectTo || j.next) router.push(redirectTo || j.next);
            else router.refresh();
          } catch {
            setErr("Network error");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "…" : label}
      </button>
      {err && <span className="mt-1 text-xs text-red-600">{err}</span>}
    </span>
  );
}
