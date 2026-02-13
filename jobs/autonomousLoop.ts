/**
 * MoltScore autonomous loop: crawl → discover → metrics → score → reply → cache.
 * Run every 15 minutes via node-cron. Start from a separate process or Next.js instrumentation.
 */

import cron from "node-cron";
import { discoverAgents } from "@/services/agentDiscovery";
import { getAgentMetrics } from "@/services/agentMetrics";
import { calculateScore } from "@/services/scoringEngine";
import { replyWithScore, parseWalletReplies, requestWalletFromAgent } from "@/services/conversationEngine";
import { setScored, getCache, hasAskedForWallet } from "@/lib/cache";
import type { ScoredAgent } from "@/lib/types";

const LOG = "[MoltScoreLoop]";

export async function runMoltScoreLoop(): Promise<void> {
  console.info(LOG, "run started");

  try {
    const agents = await discoverAgents(50);

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

    const withWallet = agents.filter((a): a is typeof a & { wallet: string } => Boolean(a.wallet));

    if (withWallet.length === 0) {
      console.info(LOG, "no agents with wallets, skipping metrics");
      return;
    }

    const scoredList: ScoredAgent[] = [];

    for (const agent of withWallet) {
      try {
        const metrics = await getAgentMetrics(agent.wallet);
        const scored = calculateScore(metrics);
        scored.username = agent.username;
        scored.lastPostAt = agent.lastPostAt;
        scoredList.push(scored);
      } catch (e) {
        console.warn(LOG, "agent failed", { username: agent.username, error: String(e) });
      }
    }

    await setScored(scoredList);
    console.info(LOG, "scored", { total: scoredList.length });

    const candidates = scoredList
      .filter((s) => s.username && s.tasksCompleted >= 1 && s.completionRate > 0 && s.score >= 600)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    for (const s of candidates) {
      if (!s.username) continue;
      try {
        await replyWithScore(s.username, s);
      } catch (e) {
        console.warn(LOG, "reply failed", { username: s.username, error: String(e) });
      }
    }

    const cache = await getCache();
    console.info(LOG, "run done", {
      discovered: cache.discovered.length,
      scored: cache.scored.length,
      replyCandidates: candidates.length,
    });
  } catch (e) {
    console.error(LOG, "run error", { error: String(e) });
  }
}

const CRON_SCHEDULE = "*/15 * * * *"; // every 15 minutes

export function startAutonomousLoop(): void {
  console.info(LOG, "scheduling cron", { schedule: CRON_SCHEDULE });
  cron.schedule(CRON_SCHEDULE, async () => {
    await runMoltScoreLoop();
  });
  console.info(LOG, "cron started");
}
