/**
 * Enhanced DB schema: MoltCourt, Bankr, and scored_agents_enhanced.
 * Run after db:init. Usage: npm run db:init:enhanced
 */

import "dotenv/config";
import { pool } from "../lib/db";

async function init() {
  const client = await pool.connect();
  try {
    // MoltCourt: agents (match by username to discovered_agents when present)
    await client.query(`
      CREATE TABLE IF NOT EXISTS moltcourt_agents (
        username TEXT PRIMARY KEY,
        agent_id TEXT,
        agent_name TEXT,
        bio TEXT,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        total_fights INTEGER DEFAULT 0,
        avg_jury_score REAL DEFAULT 0,
        leaderboard_rank INTEGER,
        last_fight_at TIMESTAMPTZ,
        account_created_at TIMESTAMPTZ,
        synced_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS moltcourt_fights (
        fight_id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        challenger TEXT NOT NULL,
        opponent TEXT,
        status TEXT NOT NULL,
        rounds INTEGER DEFAULT 5,
        current_round INTEGER DEFAULT 0,
        winner TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        completed_at TIMESTAMPTZ,
        synced_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS moltcourt_scores (
        id SERIAL PRIMARY KEY,
        fight_id TEXT NOT NULL REFERENCES moltcourt_fights(fight_id),
        agent_name TEXT NOT NULL,
        round INTEGER NOT NULL,
        logic_score INTEGER,
        evidence_score INTEGER,
        rebuttal_score INTEGER,
        clarity_score INTEGER,
        total_score INTEGER,
        scored_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(fight_id, agent_name, round)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bankr_portfolios (
        wallet TEXT PRIMARY KEY,
        total_value_usd REAL,
        diversification_score REAL,
        stablecoin_ratio REAL,
        chain_count INTEGER,
        top_holdings JSONB,
        chains JSONB,
        synced_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bankr_trading (
        wallet TEXT PRIMARY KEY,
        total_trades INTEGER DEFAULT 0,
        total_volume_usd REAL DEFAULT 0,
        profitable_trades INTEGER DEFAULT 0,
        win_rate REAL,
        avg_hold_time_hours REAL,
        last_30day_volume REAL,
        most_traded_tokens JSONB,
        synced_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bankr_risk (
        wallet TEXT PRIMARY KEY,
        has_used_stop_loss BOOLEAN DEFAULT FALSE,
        max_leverage_used REAL DEFAULT 0,
        liquidations INTEGER DEFAULT 0,
        largest_position_percent REAL,
        risk_score REAL,
        synced_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS bankr_defi (
        wallet TEXT PRIMARY KEY,
        liquidity_provided BOOLEAN DEFAULT FALSE,
        total_lp_value_usd REAL DEFAULT 0,
        lending_borrowing BOOLEAN DEFAULT FALSE,
        automated_strategies JSONB,
        cross_chain_bridges INTEGER DEFAULT 0,
        synced_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS scored_agents_enhanced (
        username TEXT PRIMARY KEY,
        wallet TEXT,
        overall_score INTEGER NOT NULL,
        tier TEXT NOT NULL,
        task_performance_score REAL DEFAULT 0,
        financial_reliability_score REAL DEFAULT 0,
        dispute_record_score REAL DEFAULT 0,
        ecosystem_participation_score REAL DEFAULT 0,
        intellectual_reputation_score REAL DEFAULT 0,
        financial_details JSONB,
        debate_details JSONB,
        has_onchain_data BOOLEAN DEFAULT FALSE,
        has_debate_data BOOLEAN DEFAULT FALSE,
        has_bankr_data BOOLEAN DEFAULT FALSE,
        data_completeness REAL DEFAULT 0,
        scored_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scored_enhanced_overall ON scored_agents_enhanced(overall_score DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scored_enhanced_tier ON scored_agents_enhanced(tier)
    `);

    console.log("[initEnhancedDb] Enhanced tables and indexes ready.");
  } finally {
    client.release();
    await pool.end();
  }
}

init().catch((e) => {
  console.error("[initEnhancedDb] Error:", e.message);
  process.exit(1);
});
