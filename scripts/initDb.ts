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
    await client.query(`
      CREATE TABLE IF NOT EXISTS scan_state (
        contract_key TEXT PRIMARY KEY,
        last_block BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS wallet_metrics (
        wallet TEXT PRIMARY KEY,
        tasks_completed INT NOT NULL DEFAULT 0,
        tasks_failed INT NOT NULL DEFAULT 0,
        disputes INT NOT NULL DEFAULT 0,
        slashes INT NOT NULL DEFAULT 0,
        first_block_timestamp BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    // Mandate Protocol: agents discovered from Identity Registry
    await client.query(`
      CREATE TABLE IF NOT EXISTS mandate_agents (
        agent_id INT PRIMARY KEY,
        owner_address TEXT NOT NULL,
        wallet_address TEXT,
        agent_uri TEXT,
        -- Escrow metrics (filled by mandateEscrow.ts)
        mandates_as_worker INT NOT NULL DEFAULT 0,
        mandates_as_creator INT NOT NULL DEFAULT 0,
        mandates_completed INT NOT NULL DEFAULT 0,
        mandates_disputed INT NOT NULL DEFAULT 0,
        mandates_cancelled INT NOT NULL DEFAULT 0,
        total_earned_wei TEXT NOT NULL DEFAULT '0',
        -- Reputation metrics (filled by mandateReputation.ts)
        feedback_count INT NOT NULL DEFAULT 0,
        avg_feedback_value FLOAT NOT NULL DEFAULT 0,
        unique_reviewers INT NOT NULL DEFAULT 0,
        -- Scoring (filled by mandateScoringEngine.ts)
        score INT,
        tier TEXT,
        score_components JSONB,
        last_scored_at TIMESTAMPTZ,
        -- Metadata
        discovered_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS mandate_agents_score_idx ON mandate_agents(score DESC NULLS LAST)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS mandate_agents_wallet_idx ON mandate_agents(wallet_address)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id SERIAL PRIMARY KEY,
        key_hash TEXT NOT NULL UNIQUE,
        key_prefix TEXT NOT NULL,
        name TEXT NOT NULL,
        key_type TEXT NOT NULL DEFAULT 'read',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_used_at TIMESTAMPTZ,
        requests_today INT DEFAULT 0,
        rate_limit_day INT DEFAULT 1000
      )
    `);
    console.log("[initDb] Tables and indexes ready.");
  } finally {
    client.release();
    await pool.end();
  }
}

init().catch((e) => {
  console.error("[initDb] Error:", e.message);
  process.exit(1);
});
