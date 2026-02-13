/**
 * Server-side Postgres pool. Reused across requests; do not create a new pool per request.
 */

import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

export const pool = new Pool({
  connectionString: DATABASE_URL,
});
