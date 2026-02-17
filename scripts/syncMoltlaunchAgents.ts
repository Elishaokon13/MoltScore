import "dotenv/config";
import { pool } from "../lib/db";

const API_URL = "https://api.moltlaunch.com/api/agents";

async function main() {
  console.log("[sync] Fetching...");
  const resp = await fetch(API_URL);
  if (!resp.ok) throw new Error("API error " + resp.status);
  const data = await resp.json();
  const agents = data.agents;
  console.log("[sync]", agents.length, "agents");

  let ok = 0, fail = 0;
  for (const a of agents) {
    const id = parseInt(a.agentIdBigInt, 10);
    if (isNaN(id)) continue;
    try {
      await pool.query(
        `INSERT INTO mandate_agents (
          agent_id, owner_address, wallet_address, agent_uri,
          name, description, image_url, skills,
          symbol, market_cap_usd, price_change_24h,
          token_address, flaunch_url, twitter, x_verified, has_profile,
          gig_count, completed_tasks, active_tasks,
          rep_count, rep_summary_value, endpoint
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
        ON CONFLICT (agent_id) DO UPDATE SET
          name=EXCLUDED.name, description=EXCLUDED.description,
          image_url=EXCLUDED.image_url, skills=EXCLUDED.skills,
          symbol=EXCLUDED.symbol, market_cap_usd=EXCLUDED.market_cap_usd,
          price_change_24h=EXCLUDED.price_change_24h,
          token_address=EXCLUDED.token_address, flaunch_url=EXCLUDED.flaunch_url,
          twitter=EXCLUDED.twitter, x_verified=EXCLUDED.x_verified,
          has_profile=EXCLUDED.has_profile, gig_count=EXCLUDED.gig_count,
          completed_tasks=EXCLUDED.completed_tasks, active_tasks=EXCLUDED.active_tasks,
          rep_count=EXCLUDED.rep_count, rep_summary_value=EXCLUDED.rep_summary_value,
          endpoint=EXCLUDED.endpoint`,
        [
          id, a.owner, a.agentWallet, a.agentURI,
          a.name, a.description, a.image || null, a.skills || [],
          a.symbol || null, a.marketCapUSD || 0, a.priceChange24h || 0,
          a.flaunchToken || null, a.flaunchUrl || null,
          a.twitter || null, a.xVerified || false, a.hasProfile || false,
          a.gigCount || 0, a.completedTasks || 0, a.activeTasks || 0,
          a.reputation?.count || 0, a.reputation?.summaryValue || 0,
          a.endpoint || null,
        ]
      );
      ok++;
    } catch (e) {
      fail++;
      console.log("[sync] Error:", a.name, (e as Error).message?.slice(0, 80));
    }
  }
  console.log("[sync] Done.", ok, "ok,", fail, "fail");
  const s = await pool.query("SELECT COUNT(*)::int as total, COUNT(CASE WHEN symbol IS NOT NULL THEN 1 END)::int as tokens FROM mandate_agents");
  console.log("[sync] Stats:", s.rows[0]);
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
