/**
 * One-time DB init: create tables and index if they do not exist.
 * Run: npm run db:init
 * Requires DATABASE_URL in .env (or env).
 */

import "dotenv/config";
import { pool } from "../lib/db";

async function init() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS discovered_agents (
        username TEXT PRIMARY KEY,
        wallet TEXT,
        last_seen_at TIMESTAMPTZ DEFAULT NOW(),
        last_post_at TIMESTAMPTZ
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS scored_agents (
        username TEXT PRIMARY KEY,
        wallet TEXT,
        score INT,
        tier TEXT,
        completion_rate FLOAT,
        tasks_completed INT,
        tasks_failed INT,
        disputes INT,
        slashes INT,
        age_days INT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS replied_agents (
        username TEXT PRIMARY KEY,
        replied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS scored_agents_score_idx ON scored_agents(score DESC)
    `);
    console.log("[initDb] Tables and index ready.");
  } finally {
    client.release();
    await pool.end();
  }
}

init().catch((e) => {
  console.error("[initDb] Error:", e.message);
  process.exit(1);
});
