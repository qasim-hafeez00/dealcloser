import { Pool, type QueryResultRow } from "pg";
import { attachDatabasePool } from "@vercel/functions";

// Neon pooled URL (-pooler) + node-postgres + attachDatabasePool (Vercel Fluid compute).
const g = globalThis as unknown as { __dcPool?: Pool };

function makePool(): Pool {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
  });
  try {
    attachDatabasePool(pool);
  } catch {
    /* not on Vercel */
  }
  return pool;
}

export const pool: Pool = g.__dcPool ?? (g.__dcPool = makePool());

export async function q<T extends QueryResultRow = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query<T>(sql, params);
  return r.rows;
}

export async function q1<T extends QueryResultRow = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
}
