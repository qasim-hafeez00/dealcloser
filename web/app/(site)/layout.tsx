import Link from "next/link";
import { Car } from "lucide-react";
import ChatWidget from "@/components/ChatWidget";
import { getSession } from "@/lib/auth";

const NAV = [
  { href: "/inventory", label: "Inventory" },
  { href: "/financing", label: "Financing" },
  { href: "/visit", label: "Visit us" },
];

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const s = await getSession();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-brand-700">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700 text-white"><Car size={20} /></span>
            <span className="text-lg">Apex Motors</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 sm:flex">
            {NAV.map((n) => <Link key={n.href} href={n.href} className="hover:text-brand-700">{n.label}</Link>)}
          </nav>
          <div className="flex items-center gap-2 text-sm">
            {s ? (
              <>
                {s.role === "admin" && <Link href="/admin" className="btn-ghost !py-1.5">Dashboard</Link>}
                <Link href="/account" className="btn-primary !py-1.5">Hi, {s.name.split(" ")[0]}</Link>
              </>
            ) : (
              <>
                <Link href="/login" className="font-medium text-slate-600 hover:text-brand-700">Log in</Link>
                <Link href="/signup" className="btn-primary !py-1.5">Sign up</Link>
              </>
            )}
          </div>
        </div>
        <nav className="flex justify-center gap-6 border-t border-slate-100 py-2 text-sm font-medium text-slate-600 sm:hidden">
          {NAV.map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm text-slate-500 sm:grid-cols-3">
          <div>
            <div className="font-semibold text-slate-800">Apex Motors</div>
            <p>42 Demo Avenue, Gulberg, Lahore (fictional demo dealership)</p>
            <p>Mon–Sat 10:00–18:00 · Closed Sunday</p>
          </div>
          <div className="space-y-1">
            <Link href="/inventory" className="block hover:text-brand-700">Browse inventory</Link>
            <Link href="/financing" className="block hover:text-brand-700">Payment calculator</Link>
            <Link href="/visit" className="block hover:text-brand-700">Book a visit</Link>
          </div>
          <div>
            <p>Ava is an AI assistant: prices come from live inventory; payments and trade-ins are estimates.</p>
            <p className="mt-2">Powered by <span className="font-semibold text-brand-700">DealCloser</span> · LangGraph + Claude</p>
          </div>
        </div>
      </footer>
      <ChatWidget />
    </div>
  );
}
