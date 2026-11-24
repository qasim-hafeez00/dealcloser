import Link from "next/link";
import { BarChart3, CalendarDays, Car, Gauge, Mail, MessagesSquare, PhoneCall, Settings, ShieldAlert, Users } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import PostButton from "@/components/PostButton";

export const metadata = { title: { default: "Dealer dashboard", template: "%s · Dealer dashboard" } };

const NAV = [
  { href: "/admin", label: "Overview", icon: BarChart3 },
  { href: "/admin/leads", label: "Leads", icon: Users },
  { href: "/admin/conversations", label: "Conversations", icon: MessagesSquare },
  { href: "/admin/test-drives", label: "Test drives", icon: CalendarDays },
  { href: "/admin/callbacks", label: "Callbacks", icon: PhoneCall },
  { href: "/admin/inventory", label: "Inventory", icon: Car },
  { href: "/admin/followups", label: "AI follow-ups", icon: Mail },
  { href: "/admin/safety", label: "Safety", icon: ShieldAlert },
  { href: "/admin/usage", label: "Usage & cost", icon: Gauge },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await requireAdmin();
  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <Link href="/admin" className="flex h-16 items-center gap-2 border-b border-slate-100 px-5 font-bold text-brand-700">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-white"><Car size={18} /></span> DealCloser
        </Link>
        <nav className="flex-1 space-y-0.5 p-3">
          {NAV.map(({ href, label, icon: I }) => (
            <Link key={href} href={href} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-brand-50 hover:text-brand-700">
              <I size={16} /> {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-4 text-xs text-slate-500">
          <div className="font-semibold text-slate-700">{s.name}</div>
          <div className="truncate">{s.email}</div>
          <div className="mt-2 flex gap-2"><Link href="/" className="btn-ghost !px-2 !py-1 !text-xs">View site</Link><PostButton url="/api/auth" body={{ action: "logout" }} label="Log out" className="btn-ghost !px-2 !py-1 !text-xs" redirectTo="/" /></div>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 md:hidden">
          {NAV.map(({ href, label }) => <Link key={href} href={href} className="whitespace-nowrap rounded-lg px-2 py-1 text-xs font-medium text-slate-600">{label}</Link>)}
        </div>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
