/**
 * Server-side Postgres pool. Reused across requests; do not create a new pool per request.
 * Pool is created on first use so build/static analysis does not require DATABASE_URL.
 */

import { Pool } from "pg";

let _pool: Pool | null = null;

function getPool(): Pool {
  if (_pool) return _pool;
  const raw = process.env.DATABASE_URL?.trim() ?? "";
  const url = raw.replace(/^["']|["']$/g, "").trim();
  if (!url) throw new Error("DATABASE_URL is required");
  if (!/^postgres(ql)?:\/\//i.test(url)) {
    throw new Error(
      "DATABASE_URL must be a postgres URL (e.g. postgresql://user:pass@host:5432/db). Check for extra quotes in .env."
    );
  }
  try {
    _pool = new Pool({ connectionString: url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`DATABASE_URL invalid: ${msg}. Remove quotes in .env and use postgresql://user:pass@host:5432/db`);
  }
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
