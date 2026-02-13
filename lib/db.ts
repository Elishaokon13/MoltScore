/**
 * Server-side Postgres pool. Reused across requests; do not create a new pool per request.
 * Pool is created on first use so build/static analysis does not require DATABASE_URL.
 */

import { Pool } from "pg";

let _pool: Pool | null = null;

function getPool(): Pool {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is required");
  _pool = new Pool({ connectionString: url });
  return _pool;
}

/** Lazy pool: same interface as Pool; created on first use. */
export const pool = new Proxy({} as Pool, {
  get(_, prop) {
    const p = getPool();
    const v = (p as unknown as Record<string, unknown>)[prop as string];
    return typeof v === "function" ? (v as (...args: unknown[]) => unknown).bind(p) : v;
  },
});
