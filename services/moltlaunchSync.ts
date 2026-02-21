/**
 * MoltLaunch API → mandate_agents sync. Fetches all pages and upserts.
 * Used by POST /api/cron/score so the DB stays in sync with api.moltlaunch.com.
 * List endpoint returns burn data on each agent; we skip per-agent gig/burn calls to stay under serverless timeout.
 */

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
  totalBurnedETH?: number;
  totalBurnedUSD?: number;
  totalBurnedTokens?: number;
}

interface ApiResponse {
  agents: MoltAgent[];
  total: number;
  page: number;
  pages: number;
}

async function fetchPage(page: number): Promise<ApiResponse> {
  const url = `${API_BASE}?page=${page}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`MoltLaunch API ${res.status}: ${res.statusText}`);
  return (await res.json()) as ApiResponse;
}

export interface MoltlaunchSyncResult {
  totalFromApi: number;
  totalPages: number;
  synced: number;
  errors: number;
  dbCount: number;
}

/**
 * Fetch all agent pages from MoltLaunch API and upsert into mandate_agents.
 * Uses list payload only (no per-agent gig/burn calls) so it finishes within serverless timeout.
 */
export async function runMoltlaunchSync(
  pool: { query: (q: string, v?: unknown[]) => Promise<{ rows: unknown[] }> }
): Promise<MoltlaunchSyncResult> {
  let totalFromApi = 0;
  let totalPages = 1;
  let synced = 0;
  let errors = 0;
  let page = 1;

  while (page <= totalPages) {
    const data = await fetchPage(page);
    totalPages = data.pages;
    totalFromApi = data.total;

    for (const agent of data.agents) {
      try {
        const agentId = parseInt(agent.agentIdBigInt, 10);
        if (isNaN(agentId)) continue;

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
            last_active_at, rep_summary_value, rep_count,
            gigs_json, total_burned_eth, total_burned_usd, total_burned_tokens
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
            $20, $21, $22, $23, $24, $25, $26, $27,
            $28, $29, $30, $31
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
            price_wei = COALESCE(EXCLUDED.price_wei, mandate_agents.price_wei),
            gig_count = EXCLUDED.gig_count,
            completed_tasks = EXCLUDED.completed_tasks,
            active_tasks = EXCLUDED.active_tasks,
            last_active_at = EXCLUDED.last_active_at,
            rep_summary_value = EXCLUDED.rep_summary_value,
            rep_count = EXCLUDED.rep_count,
            gigs_json = COALESCE(EXCLUDED.gigs_json, mandate_agents.gigs_json),
            total_burned_eth = EXCLUDED.total_burned_eth,
            total_burned_usd = EXCLUDED.total_burned_usd,
            total_burned_tokens = EXCLUDED.total_burned_tokens,
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
            agent.marketCapUSD ?? 0,
            agent.volume24hUSD ?? 0,
            agent.priceChange24h ?? 0,
            agent.liquidityUSD ?? 0,
            agent.holders ?? 0,
            agent.flaunchToken || null,
            agent.flaunchUrl || null,
            agent.twitter || null,
            agent.xVerified ?? false,
            agent.hasProfile ?? false,
            agent.endpoint || null,
            agent.priceWei || null,
            agent.gigCount ?? 0,
            agent.completedTasks ?? 0,
            agent.activeTasks ?? 0,
            lastActiveAt,
            agent.reputation?.summaryValue ?? 0,
            agent.reputation?.count ?? 0,
            null, // gigs_json — use scripts/syncMoltlaunch.ts for full sync with gigs
            agent.totalBurnedETH ?? 0,
            agent.totalBurnedUSD ?? 0,
            agent.totalBurnedTokens ?? 0,
          ]
        );
        synced++;
      } catch (e) {
        errors++;
        console.warn("[moltlaunchSync] agent", agent.agentIdBigInt, (e as Error).message);
      }
    }
    page++;
  }

  const countResult = await pool.query("SELECT COUNT(*)::int AS cnt FROM mandate_agents");
  const dbCount = (countResult.rows[0] as { cnt: number })?.cnt ?? 0;

  return {
    totalFromApi,
    totalPages,
    synced,
    errors,
    dbCount,
  };
}
