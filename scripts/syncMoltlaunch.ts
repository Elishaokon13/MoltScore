/**
 * Sync enriched agent data from Moltlaunch API into mandate_agents table.
 * Fetches all pages from https://api.moltlaunch.com/api/agents
 * Run: npx tsx scripts/syncMoltlaunch.ts
 */

import "dotenv/config";
import { pool } from "../lib/db";

const API_BASE = "https://api.moltlaunch.com/api/agents";

interface MoltAgent {
  id: string;
  agentIdBigInt: string;
  owner: string;
  agentURI: string;
  agentWallet: string;
  name: string;
  description: string;
  skills: string[];
  endpoint: string;
  priceWei: string;
  flaunchToken?: string;
  reputation: { count: number; summaryValue: number };
  marketCapUSD?: number;
  volume24hUSD?: number;
  priceChange24h?: number;
  liquidityUSD?: number;
  holders?: number;
  image?: string;
  symbol?: string;
  flaunchUrl?: string;
  twitter?: string;
  xVerified?: boolean;
  hasProfile?: boolean;
  gigCount?: number;
  completedTasks?: number;
  activeTasks?: number;
  lastActiveAt?: number;
}

interface ApiResponse {
  agents: MoltAgent[];
  total: number;
  page: number;
  pages: number;
}

async function fetchPage(page: number): Promise<ApiResponse> {
  const url = `${API_BASE}?page=${page}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return (await res.json()) as ApiResponse;
}

async function upsertAgent(agent: MoltAgent) {
  const agentId = parseInt(agent.agentIdBigInt, 10);
  const lastActiveAt = agent.lastActiveAt
    ? new Date(agent.lastActiveAt).toISOString()
    : null;

  await pool.query(
    `INSERT INTO mandate_agents (
      agent_id, owner_address, wallet_address, agent_uri,
      name, description, image_url, skills, symbol,
      market_cap_usd, volume_24h_usd, price_change_24h, liquidity_usd, holders,
      flaunch_token, flaunch_url, twitter, x_verified, has_profile,
      endpoint, price_wei, gig_count, completed_tasks, active_tasks,
      last_active_at, rep_summary_value, rep_count
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9,
      $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
      $20, $21, $22, $23, $24, $25, $26, $27
    )
    ON CONFLICT (agent_id) DO UPDATE SET
      name = COALESCE(EXCLUDED.name, mandate_agents.name),
      description = COALESCE(EXCLUDED.description, mandate_agents.description),
      image_url = COALESCE(EXCLUDED.image_url, mandate_agents.image_url),
      skills = CASE WHEN array_length(EXCLUDED.skills, 1) > 0 THEN EXCLUDED.skills ELSE mandate_agents.skills END,
      symbol = COALESCE(EXCLUDED.symbol, mandate_agents.symbol),
      market_cap_usd = EXCLUDED.market_cap_usd,
      volume_24h_usd = EXCLUDED.volume_24h_usd,
      price_change_24h = EXCLUDED.price_change_24h,
      liquidity_usd = EXCLUDED.liquidity_usd,
      holders = EXCLUDED.holders,
      flaunch_token = COALESCE(EXCLUDED.flaunch_token, mandate_agents.flaunch_token),
      flaunch_url = COALESCE(EXCLUDED.flaunch_url, mandate_agents.flaunch_url),
      twitter = COALESCE(EXCLUDED.twitter, mandate_agents.twitter),
      x_verified = EXCLUDED.x_verified,
      has_profile = EXCLUDED.has_profile,
      endpoint = COALESCE(EXCLUDED.endpoint, mandate_agents.endpoint),
      price_wei = EXCLUDED.price_wei,
      gig_count = EXCLUDED.gig_count,
      completed_tasks = EXCLUDED.completed_tasks,
      active_tasks = EXCLUDED.active_tasks,
      last_active_at = EXCLUDED.last_active_at,
      rep_summary_value = EXCLUDED.rep_summary_value,
      rep_count = EXCLUDED.rep_count,
      wallet_address = COALESCE(EXCLUDED.wallet_address, mandate_agents.wallet_address),
      owner_address = COALESCE(EXCLUDED.owner_address, mandate_agents.owner_address)
    `,
    [
      agentId,
      agent.owner,
      agent.agentWallet,
      agent.agentURI,
      agent.name || null,
      agent.description || null,
      agent.image || null,
      agent.skills || [],
      agent.symbol || null,
      agent.marketCapUSD || 0,
      agent.volume24hUSD || 0,
      agent.priceChange24h || 0,
      agent.liquidityUSD || 0,
      agent.holders || 0,
      agent.flaunchToken || null,
      agent.flaunchUrl || null,
      agent.twitter || null,
      agent.xVerified || false,
      agent.hasProfile || false,
      agent.endpoint || null,
      agent.priceWei || null,
      agent.gigCount || 0,
      agent.completedTasks || 0,
      agent.activeTasks || 0,
      lastActiveAt,
      agent.reputation?.summaryValue || 0,
      agent.reputation?.count || 0,
    ]
  );
}

async function main() {
  console.log("[sync-moltlaunch] Starting...");

  let page = 1;
  let totalSynced = 0;
  let totalPages = 1;

  while (page <= totalPages) {
    console.log(`[sync-moltlaunch] Fetching page ${page}...`);
    const data = await fetchPage(page);
    totalPages = data.pages;

    for (const agent of data.agents) {
      try {
        await upsertAgent(agent);
        totalSynced++;
      } catch (e) {
        console.error(`[sync-moltlaunch] Error upserting agent ${agent.agentIdBigInt}:`, (e as Error).message);
      }
    }

    console.log(`[sync-moltlaunch] Page ${page}/${totalPages} done (${data.agents.length} agents)`);
    page++;
  }

  console.log(`[sync-moltlaunch] Done. Total synced: ${totalSynced}`);

  // Stats
  const stats = await pool.query(`
    SELECT
      COUNT(*)::int as total,
      COUNT(CASE WHEN market_cap_usd > 0 THEN 1 END)::int as has_mcap,
      COUNT(CASE WHEN symbol IS NOT NULL THEN 1 END)::int as has_symbol,
      COUNT(CASE WHEN rep_count > 0 THEN 1 END)::int as has_rep,
      COUNT(CASE WHEN has_profile THEN 1 END)::int as has_profile_count,
      COUNT(CASE WHEN image_url IS NOT NULL THEN 1 END)::int as has_image
    FROM mandate_agents
  `);
  console.log("[sync-moltlaunch] DB Stats:", stats.rows[0]);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
