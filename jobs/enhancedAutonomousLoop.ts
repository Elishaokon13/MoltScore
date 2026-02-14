/**
 * Enhanced autonomous loop: discover → sync MoltCourt → parse wallets → onchain → enhanced score → upsert scored_agents_enhanced → reply.
 * Run: npm run job:enhanced (or run once and exit; add --once if desired).
 */

import "dotenv/config";
import { pool } from "@/lib/db";
import { discoverAgents } from "@/services/agentDiscovery";
import { getAgentMetrics } from "@/services/agentMetrics";
import { parseWalletReplies, requestWalletFromAgent, replyWithScore } from "@/services/conversationEngine";
import { MoltCourtSyncService } from "@/services/moltcourtSync";
import { calculateEnhancedScore } from "@/services/enhancedScoringEngine";
import { hasAskedForWallet } from "@/lib/cache";
import type { AgentMetrics } from "@/lib/types";
import type { ScoredAgent } from "@/lib/types";

const LOG = "[EnhancedLoop]";

const ZERO_METRICS: AgentMetrics = {
  wallet: "",
  tasksCompleted: 0,
  tasksFailed: 0,
  disputes: 0,
  slashes: 0,
  ageDays: 0,
};

export async function runEnhancedLoop(): Promise<void> {
  console.info(LOG, "run started");

  try {
    const agents = await discoverAgents(50);
    console.info(LOG, "discovered", { count: agents.length });

    const moltcourtSync = new MoltCourtSyncService();
    await moltcourtSync.syncAgents();
    await moltcourtSync.syncRecentFights();
    console.info(LOG, "MoltCourt synced");

    await parseWalletReplies();

    const noWallet = agents.filter((a) => !a.wallet && !hasAskedForWallet(a.username));
    const walletRequestLimit = 2;
    for (let i = 0; i < Math.min(noWallet.length, walletRequestLimit); i++) {
      try {
        await requestWalletFromAgent(noWallet[i].username);
      } catch (e) {
        console.warn(LOG, "wallet request failed", { username: noWallet[i].username, error: String(e) });
      }
    }

    const bankrApiKey = process.env.BANKR_API_KEY?.trim();

    const withWallet = agents.filter((a): a is typeof a & { wallet: string } => Boolean(a.wallet));
    const metricsByUsername = new Map<string, AgentMetrics>();

    for (const agent of withWallet) {
      try {
        const metrics = await getAgentMetrics(agent.wallet);
        metricsByUsername.set(agent.username, metrics);
      } catch (e) {
        console.warn(LOG, "onchain failed", { username: agent.username, error: String(e) });
        metricsByUsername.set(agent.username, { ...ZERO_METRICS, wallet: agent.wallet });
      }
    }

    for (const agent of agents) {
      if (!metricsByUsername.has(agent.username)) {
        metricsByUsername.set(agent.username, {
          ...ZERO_METRICS,
          wallet: agent.wallet ?? "",
        });
      }
    }

    for (const agent of agents) {
      const metrics = metricsByUsername.get(agent.username) ?? ZERO_METRICS;
      try {
        const score = await calculateEnhancedScore(
          agent.username,
          agent.wallet,
          metrics,
          bankrApiKey
        );

        await pool.query(
          `INSERT INTO scored_agents_enhanced (
            username, wallet, overall_score, tier,
            task_performance_score, financial_reliability_score,
            dispute_record_score, ecosystem_participation_score,
            intellectual_reputation_score,
            has_onchain_data, has_debate_data, has_bankr_data,
            data_completeness, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
          ON CONFLICT (username) DO UPDATE SET
            wallet = EXCLUDED.wallet,
            overall_score = EXCLUDED.overall_score,
            tier = EXCLUDED.tier,
            task_performance_score = EXCLUDED.task_performance_score,
            financial_reliability_score = EXCLUDED.financial_reliability_score,
            dispute_record_score = EXCLUDED.dispute_record_score,
            ecosystem_participation_score = EXCLUDED.ecosystem_participation_score,
            intellectual_reputation_score = EXCLUDED.intellectual_reputation_score,
            has_onchain_data = EXCLUDED.has_onchain_data,
            has_debate_data = EXCLUDED.has_debate_data,
            has_bankr_data = EXCLUDED.has_bankr_data,
            data_completeness = EXCLUDED.data_completeness,
            updated_at = NOW()`,
          [
            agent.username,
            agent.wallet ?? null,
            score.overallScore,
            score.tier,
            score.components.taskPerformance,
            score.components.financialReliability,
            score.components.disputeRecord,
            score.components.ecosystemParticipation,
            score.components.intellectualReputation,
            score.metadata.hasOnchainData,
            score.metadata.hasDebateData,
            score.metadata.hasBankrData,
            score.metadata.dataCompleteness,
          ]
        );
      } catch (e) {
        console.warn(LOG, "score failed", { username: agent.username, error: String(e) });
      }
    }

    console.info(LOG, "scored_agents_enhanced upserted", { count: agents.length });

    const rows = await pool.query(
      `SELECT username, wallet, overall_score, tier FROM scored_agents_enhanced ORDER BY overall_score DESC LIMIT 50`
    );
    const topList = rows.rows as { username: string; wallet: string | null; overall_score: number; tier: string }[];
    const candidates = topList
      .filter((r) => r.overall_score >= 600)
      .slice(0, 10);

    for (const r of candidates) {
      const metrics = metricsByUsername.get(r.username) ?? ZERO_METRICS;
      const fakeScored: ScoredAgent = {
        ...metrics,
        username: r.username,
        wallet: r.wallet ?? "",
        score: r.overall_score,
        tier: r.tier,
        completionRate: metrics.tasksCompleted + metrics.tasksFailed > 0
          ? metrics.tasksCompleted / (metrics.tasksCompleted + metrics.tasksFailed)
          : 0,
      };
      try {
        await replyWithScore(r.username, fakeScored);
      } catch (e) {
        console.warn(LOG, "reply failed", { username: r.username, error: String(e) });
      }
    }

    console.info(LOG, "run done", { discovered: agents.length, replyCandidates: candidates.length });
  } catch (e) {
    console.error(LOG, "run error", { error: String(e) });
    throw e;
  }
}

async function main() {
  await runEnhancedLoop();
  await pool.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(LOG, e);
  process.exit(1);
});
