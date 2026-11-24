import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <div className="text-6xl font-extrabold text-brand-700">404</div>
      <h1 className="mt-2 text-xl font-semibold">We couldn&apos;t find that page or car</h1>
      <p className="mt-2 text-sm text-slate-500">It may have been sold or the link is wrong.</p>
      <div className="mt-6 flex justify-center gap-3"><Link href="/inventory" className="btn-primary">Browse inventory</Link><Link href="/" className="btn-ghost">Home</Link></div>
    </div>
  );
}
