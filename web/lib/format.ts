export const TZ = "Asia/Karachi";

export const money = (n: number | null | undefined) =>
  n == null ? "–" : "$" + Math.round(Number(n)).toLocaleString("en-US");

export const miles = (n: number) => Number(n).toLocaleString("en-US") + " mi";

export function slot(d: string | Date): string {
  return new Date(d).toLocaleString("en-GB", { timeZone: TZ, weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function when(d: string | Date | null | undefined): string {
  if (!d) return "–";
  return new Date(d).toLocaleString("en-GB", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function ago(d: string | Date | null | undefined): string {
  if (!d) return "–";
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// Same formula as the agent's estimate_financing tool (api/app/logic.py); shared fixtures in tests.
export function monthlyPayment(price: number, down: number, term: number, apr: number): number {
  const p = price - down;
  if (p <= 0) return 0;
  if (apr === 0) return p / term;
  const r = apr / 1200;
  return (p * r) / (1 - Math.pow(1 + r, -term));
}

export type Vehicle = {
  id: string; make: string; model: string; trim: string | null; year: number; price: number; mileage: number;
  fuel: string; transmission: string; body_type: string; seats: number; color: string; mpg: string | null;
  features: string[]; description: string; featured: boolean; status: "available" | "reserved" | "sold";
};

export const title = (v: Pick<Vehicle, "year" | "make" | "model" | "trim">) =>
  [v.year, v.make, v.model, v.trim].filter(Boolean).join(" ");

export const STAGES = ["new", "engaged", "qualified", "visit_booked", "won", "lost"] as const;
export const stageLabel: Record<string, string> = { new: "New", engaged: "Engaged", qualified: "Qualified", visit_booked: "Visit booked", won: "Won", lost: "Lost" };
