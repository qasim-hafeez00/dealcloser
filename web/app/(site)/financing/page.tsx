import Calculator from "./Calculator";

export const metadata = { title: "Payment calculator" };

export default async function Financing({ searchParams }: { searchParams: Promise<{ price?: string }> }) {
  const sp = await searchParams;
  const price = Math.min(Math.max(Number(sp.price) || 27900, 1000), 200000);
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-bold">Payment calculator</h1>
      <p className="text-sm text-slate-500">Uses the same formula as Ava. Estimates only: excludes tax and fees; your APR depends on credit (partner rates from 5.9%).</p>
      <Calculator initialPrice={price} />
    </div>
  );
}
