"use client";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const C = ["#1e3a8a", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#06b6d4"];

export function LineCard({ title, data, x, series, height = 240 }: { title: string; data: Record<string, unknown>[]; x: string; series: { key: string; name: string }[]; height?: number }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      {data.length === 0 ? <Empty /> : (
        <div style={{ height }} className="mt-3">
          <ResponsiveContainer>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey={x} tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
              {series.map((s, i) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={C[i % C.length]} strokeWidth={2} dot={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function BarCard({ title, data, x, y, name, horizontal = false, height = 240, color = 0 }: { title: string; data: Record<string, unknown>[]; x: string; y: string; name: string; horizontal?: boolean; height?: number; color?: number }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      {data.length === 0 ? <Empty /> : (
        <div style={{ height }} className="mt-3">
          <ResponsiveContainer>
            <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ left: horizontal ? 30 : 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              {horizontal ? <><XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} /><YAxis type="category" dataKey={x} tick={{ fontSize: 11 }} width={110} /></>
                : <><XAxis dataKey={x} tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /></>}
              <Tooltip />
              <Bar dataKey={y} name={name} fill={C[color % C.length]} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Empty() {
  return <div className="flex h-40 items-center justify-center text-sm text-slate-400">No data yet</div>;
}
