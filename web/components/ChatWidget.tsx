"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Check, Loader2, MessageCircle, RotateCcw, Send, Wrench, X } from "lucide-react";

type Msg = { role: "user" | "ava"; text: string; tools?: string[]; awaiting?: boolean; error?: boolean };

const TOOL_LABEL: Record<string, string> = {
  search_inventory: "Searched inventory", get_vehicle_details: "Looked up car", compare_vehicles: "Compared cars",
  estimate_financing: "Calculated payment", estimate_trade_in: "Valued trade-in", check_test_drive_slots: "Checked slots",
  book_test_drive: "Booked test drive", cancel_test_drive: "Cancelled test drive", my_test_drives: "Checked bookings",
  save_buyer_profile: "Saved preferences", dealer_info: "Dealer info", request_callback: "Requested callback", forget_me: "Deleted memory",
};
const SUGGESTIONS = ["Family SUV under $30k", "Monthly payment on APX-104 with $5k down?", "What's my 2016 Civic worth?", "What are your hours?"];
const KEY = "dc_chat_v1";

function newThread() {
  return "w" + Math.random().toString(36).slice(2, 10);
}

function load(): { thread: string; msgs: Msg[] } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* storage blocked */ }
  return { thread: newThread(), msgs: [] };
}

function RichText({ text }: { text: string }) {
  const parts = text.split(/(APX-\d{3}|TD-\d+|CB-\d+)/g);
  return (
    <span className="whitespace-pre-wrap">
      {parts.map((p, i) =>
        /^APX-\d{3}$/.test(p) ? (
          <Link key={i} href={`/inventory/${p}`} className="rounded bg-brand-50 px-1 font-mono text-[12px] font-semibold text-brand-700 hover:underline">{p}</Link>
        ) : /^(TD|CB)-\d+$/.test(p) ? (
          <span key={i} className="rounded bg-emerald-50 px-1 font-mono text-[12px] font-semibold text-emerald-700">{p}</span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const s = load();
    setThread(s.thread);
    setMsgs(s.msgs);
  }, []);

  useEffect(() => {
    if (!thread) return;
    try { localStorage.setItem(KEY, JSON.stringify({ thread, msgs: msgs.slice(-40) })); } catch { /* ignore */ }
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, thread, open]);

  const send = useCallback(async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setOpen(true);
    setBusy(true);
    setInput("");
    setMsgs((m) => [...m.map((x) => ({ ...x, awaiting: false })), { role: "user", text: message }]);
    try {
      const r = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: thread || "web", message }),
        signal: AbortSignal.timeout(58_000),
      });
      const j = await r.json();
      setMsgs((m) => [...m, {
        role: "ava", text: j.reply || "Sorry, something went wrong.", tools: (j.tool_calls || []).map((t: { name: string }) => t.name),
        awaiting: !!j.awaiting_confirmation, error: !r.ok && r.status !== 429,
      }]);
    } catch {
      setMsgs((m) => [...m, { role: "ava", text: "That took too long. Please try again, or use the contact form on the Visit page.", error: true }]);
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [busy, thread]);

  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      setOpen(true);
      if (d.message) send(d.message);
    };
    window.addEventListener("dc:chat", h);
    return () => window.removeEventListener("dc:chat", h);
  }, [send]);

  const reset = () => { setMsgs([]); setThread(newThread()); };
  const lastAwaiting = msgs.length > 0 && msgs[msgs.length - 1].awaiting;

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)} aria-label="Chat with Ava"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-brand-700 px-5 py-3 font-semibold text-white shadow-xl hover:bg-brand-600">
          <MessageCircle size={20} /> Chat with Ava
        </button>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex h-[100dvh] flex-col bg-white sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[640px] sm:max-h-[calc(100dvh-40px)] sm:w-[400px] sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-2xl">
          <div className="flex items-center justify-between rounded-t-2xl bg-brand-700 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15"><Bot size={20} /></div>
              <div>
                <div className="font-semibold leading-tight">Ava · Apex Motors</div>
                <div className="text-xs text-white/70">AI sales assistant · replies in seconds</div>
              </div>
            </div>
            <div className="flex gap-1">
              <button onClick={reset} title="New conversation" className="rounded-lg p-2 hover:bg-white/10"><RotateCcw size={16} /></button>
              <button onClick={() => setOpen(false)} title="Close" className="rounded-lg p-2 hover:bg-white/10"><X size={18} /></button>
            </div>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
            {msgs.length === 0 && (
              <div className="space-y-3">
                <div className="rounded-2xl rounded-tl-sm bg-white p-3 text-sm shadow-sm">
                  Hi! I&apos;m Ava. I can find you a car from our inventory, estimate monthly payments or your trade-in, and book a test drive. What are you looking for?
                </div>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="rounded-full border border-brand-100 bg-white px-3 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[85%] text-sm ${m.role === "user" ? "rounded-2xl rounded-tr-sm bg-brand-700 px-3 py-2 text-white" : ""}`}>
                  {m.role === "user" ? m.text : (
                    <div className="space-y-1.5">
                      {m.tools && m.tools.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {m.tools.map((t, j) => (
                            <span key={j} className="inline-flex items-center gap-1 rounded-full bg-slate-200/70 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                              <Wrench size={10} /> {TOOL_LABEL[t] || t}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className={`rounded-2xl rounded-tl-sm px-3 py-2 shadow-sm ${m.error ? "bg-red-50 text-red-700" : m.awaiting ? "border border-amber-300 bg-amber-50" : "bg-white"}`}>
                        <RichText text={m.text} />
                        {m.error && <div className="mt-1 text-xs"><Link href="/visit" className="underline">Contact form</Link></div>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 size={14} className="animate-spin" /> Ava is checking…</div>
            )}
            <div ref={endRef} />
          </div>

          {lastAwaiting && !busy && (
            <div className="flex gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2">
              <button onClick={() => send("yes")} className="btn-primary flex-1"><Check size={16} /> Confirm</button>
              <button onClick={() => send("no")} className="btn-ghost flex-1">Change</button>
            </div>
          )}

          <form className="flex items-end gap-2 border-t border-slate-200 p-3" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} rows={1} maxLength={2000}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
              placeholder="Ask about cars, payments, test drives…" className="input max-h-28 flex-1 resize-none" />
            <button type="submit" disabled={busy || !input.trim()} className="btn-primary h-10 w-10 !px-0" aria-label="Send"><Send size={16} /></button>
          </form>
          <p className="pb-2 text-center text-[10px] text-slate-400">AI estimates only · prices and availability from live inventory</p>
        </div>
      )}
    </>
  );
}
