"use client";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import AskAva from "@/components/AskAva";
import { money, monthlyPayment } from "@/lib/format";

const TERMS = [24, 36, 48, 60, 72, 84];

export default function Calculator({ initialPrice }: { initialPrice: number }) {
  const [price, setPrice] = useState(initialPrice);
  const [down, setDown] = useState(Math.round(initialPrice * 0.1));
  const [term, setTerm] = useState(60);
  const [apr, setApr] = useState(7.9);
  const d = Math.min(down, price - 1);
  const pay = monthlyPayment(price, d, term, apr);
  const principal = price - d;
  const interest = pay * term - principal;

  const schedule = useMemo(() => {
    const rows: { month: number; balance: number; interest: number }[] = [];
    let bal = principal, paidInt = 0;
    const r = apr / 1200;
    for (let m = 1; m <= term; m++) {
      const i = bal * r;
      paidInt += i;
      bal = Math.max(0, bal - (pay - i));
      if (m % 3 === 0 || m === term) rows.push({ month: m, balance: Math.round(bal), interest: Math.round(paidInt) });
    }
    return rows;
  }, [principal, apr, term, pay]);

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-5">
      <div className="card space-y-5 p-6 lg:col-span-2">
        <div>
          <label className="label">Car price: {money(price)}</label>
          <input type="range" min={5000} max={60000} step={100} value={price} onChange={(e) => setPrice(Number(e.target.value))} className="w-full accent-brand-700" />
        </div>
        <div>
          <label className="label">Down payment: {money(d)} ({Math.round((d / price) * 100)}%)</label>
          <input type="range" min={0} max={Math.round(price * 0.6)} step={100} value={d} onChange={(e) => setDown(Number(e.target.value))} className="w-full accent-brand-700" />
        </div>
        <div>
          <label className="label">Term</label>
          <div className="grid grid-cols-6 gap-1">
            {TERMS.map((t) => (
              <button key={t} onClick={() => setTerm(t)} className={`rounded-lg py-1.5 text-sm font-medium ${t === term ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600"}`}>{t}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">APR: {apr.toFixed(1)}%</label>
          <input type="range" min={0} max={20} step={0.1} value={apr} onChange={(e) => setApr(Number(e.target.value))} className="w-full accent-brand-700" />
        </div>
        <div className="rounded-xl bg-brand-50 p-4 text-center">
          <div className="text-sm text-slate-500">Estimated monthly payment</div>
          <div className="text-4xl font-extrabold text-brand-700">{money(pay)}</div>
          <div className="mt-1 text-xs text-slate-500">Total interest {money(interest)} · total paid {money(pay * term + d)}</div>
        </div>
        <AskAva label="Find cars at this budget" message={`Which cars could I get for about ${money(pay)}/month with ${money(d)} down over ${term} months?`} className="btn-primary w-full" />
      </div>
      <div className="space-y-6 lg:col-span-3">
        <div className="card p-6">
          <h2 className="font-semibold">Loan balance over time</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer>
              <AreaChart data={schedule}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} label={{ value: "month", position: "insideBottomRight", offset: -2, fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
                <Tooltip formatter={(v) => money(Number(v))} />
                <Area type="monotone" dataKey="balance" name="Balance" stroke="#1e3a8a" fill="#c7d2fe" />
                <Area type="monotone" dataKey="interest" name="Interest paid" stroke="#f59e0b" fill="#fde68a" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card flex flex-col items-center gap-6 p-6 sm:flex-row">
          <div className="h-44 w-44">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={[{ name: "Principal", value: Math.round(principal) }, { name: "Interest", value: Math.round(interest) }, { name: "Down payment", value: d }]}
                  dataKey="value" innerRadius={45} outerRadius={75} paddingAngle={2}>
                  {["#1e3a8a", "#f59e0b", "#94a3b8"].map((c) => <Cell key={c} fill={c} />)}
                </Pie>
                <Tooltip formatter={(v) => money(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 text-sm">
            <h2 className="font-semibold">Where your money goes</h2>
            <p><span className="mr-2 inline-block h-3 w-3 rounded bg-brand-700" />Principal {money(principal)}</p>
            <p><span className="mr-2 inline-block h-3 w-3 rounded bg-accent-500" />Interest {money(interest)}</p>
            <p><span className="mr-2 inline-block h-3 w-3 rounded bg-slate-400" />Down payment {money(d)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
