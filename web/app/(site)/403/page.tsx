import Link from "next/link";

export const metadata = { title: "Access denied" };

export default function Forbidden() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <div className="text-6xl font-extrabold text-brand-700">403</div>
      <h1 className="mt-2 text-xl font-semibold">This area is for dealership staff</h1>
      <p className="mt-2 text-sm text-slate-500">Your account doesn&apos;t have access to the dealer dashboard.</p>
      <div className="mt-6 flex justify-center gap-3"><Link href="/" className="btn-primary">Go home</Link><Link href="/account" className="btn-ghost">My account</Link></div>
    </div>
  );
}
