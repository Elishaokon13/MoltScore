/**
 * POST /api/cron/score — Trigger one scoring cycle.
 * Called by GitHub Actions (or any external cron) every 15 minutes.
 *
 * Protected by CRON_SECRET — must match Authorization: Bearer <secret> header.
 * Returns summary of what was discovered, scored, and replied.
 */

import { NextRequest, NextResponse } from "next/server";
import { discoverAgents } from "@/services/agentDiscovery";
import { getAgentMetrics } from "@/services/agentMetrics";
import {
  calculateScore,
  calculateActivityScore,
  getTier,
} from "@/services/scoringEngine";
import {
  replyWithScore,
  parseWalletReplies,
  requestWalletFromAgent,
} from "@/services/conversationEngine";
import { fetchMoltCourtLeaderboard, reputationToBonus } from "@/services/moltcourt";
import { setScored, getCache, hasAskedForWallet } from "@/lib/cache";
import type { ScoredAgent } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel Hobby max; Pro plan can increase to 300

const LOG = "[CronScore]";

function verifyAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn(LOG, "CRON_SECRET not set — rejecting all requests");
    return false;
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;

  const token = authHeader.replace(/^Bearer\s+/i, "");
  return token === secret;
}

export async function POST(req: NextRequest) {
  const startMs = Date.now();

  if (!verifyAuth(req)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    console.info(LOG, "scoring cycle started");

    // 1. Discover agents from Moltbook feed
    const agents = await discoverAgents(50);
    console.info(LOG, "discovered", { count: agents.length });

    // 2. Parse wallet replies from previous outreach
    await parseWalletReplies();

    // 3. Request wallets from agents who don't have one (limit 2 per cycle)
    const noWallet = agents.filter(
      (a) => !a.wallet && !hasAskedForWallet(a.username)
    );
    const walletRequestLimit = 2;
    let walletRequests = 0;
    for (let i = 0; i < Math.min(noWallet.length, walletRequestLimit); i++) {
      try {
        await requestWalletFromAgent(noWallet[i].username);
        walletRequests++;
      } catch (e) {
        console.warn(LOG, "wallet request failed", {
          username: noWallet[i].username,
          error: String(e),
        });
      }
    }

    // 4. Score agents with wallets (onchain metrics)
    const withWallet = agents.filter(
      (a): a is typeof a & { wallet: string } => Boolean(a.wallet)
    );
    const scoredList: ScoredAgent[] = [];

    for (const agent of withWallet) {
      try {
        const metrics = await getAgentMetrics(agent.wallet);
        const scored = calculateScore(metrics);
        scored.username = agent.username;
        scored.lastPostAt = agent.lastPostAt;
        scoredList.push(scored);
      } catch (e) {
        console.warn(LOG, "agent scoring failed", {
          username: agent.username,
          error: String(e),
        });
      }
    }

    // 5. Score agents without wallets (activity-based)
    for (const agent of agents.filter((a) => !a.wallet)) {
      try {
        const scored = calculateActivityScore(agent);
        scoredList.push(scored);
      } catch (e) {
        console.warn(LOG, "activity scoring failed", {
          username: agent.username,
          error: String(e),
        });
      }
    }

    // 6. Apply MoltCourt debate bonus
    const moltcourtMap = await fetchMoltCourtLeaderboard();
    const DEBATE_BONUS_CAP = 40;
    for (const s of scoredList) {
      const key = (s.username ?? "").toLowerCase();
      const entry = moltcourtMap.get(key);
      if (entry) {
        const bonus = reputationToBonus(entry.reputation, DEBATE_BONUS_CAP);
        s.score = Math.min(950, s.score + bonus);
      }
      s.tier = getTier(s.score);
    }

    // 7. Save scores to database
    scoredList.sort((a, b) => b.score - a.score);
    await setScored(scoredList);
    console.info(LOG, "scored", { total: scoredList.length });

    // 8. Reply to eligible agents on Moltbook
    const candidates = scoredList
      .filter(
        (s) =>
          s.username &&
          s.tasksCompleted >= 1 &&
          s.completionRate > 0 &&
          s.score >= 600
      )
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    let replies = 0;
    for (const s of candidates) {
      if (!s.username) continue;
      try {
        await replyWithScore(s.username, s);
        replies++;
      } catch (e) {
        console.warn(LOG, "reply failed", {
          username: s.username,
          error: String(e),
        });
      }
    }

    const cache = await getCache();
    const elapsedMs = Date.now() - startMs;

    const summary = {
      success: true,
      elapsedMs,
      discovered: agents.length,
      withWallet: withWallet.length,
      scored: scoredList.length,
      walletRequests,
      replyCandidates: candidates.length,
      repliesSent: replies,
      totalDiscovered: cache.discovered.length,
      totalScored: cache.scored.length,
    };

    console.info(LOG, "cycle complete", summary);
    return NextResponse.json(summary);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error(LOG, "cycle failed", { error: message });
    return NextResponse.json(
      { success: false, error: message, elapsedMs: Date.now() - startMs },
      { status: 500 }
    );
  }
}
