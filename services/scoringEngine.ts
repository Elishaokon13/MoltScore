/**
 * MoltScore formula and tier assignment.
 * Activity score: for agents without wallet, rank by recency + feed presence.
 */

import type { AgentMetrics, ScoredAgent, DiscoveredAgent } from "@/lib/types";

const TIERS = [
  [850, "AAA"],
  [800, "AA"],
  [750, "A"],
  [700, "BBB"],
  [650, "BB"],
] as const;

export function getTier(score: number): string {
  for (const [min, tier] of TIERS) {
    if (score >= min) return tier;
  }
  return "Risk Watch";
}

/**
 * completionRate = tasksCompleted / (tasksCompleted + tasksFailed)
 * score = 700 + (completionRate * 200) - (disputes * 25) - (slashes * 50) + (min(ageDays/30, 1) * 50)
 * Clamp 300–950, round integer.
 */
export function calculateScore(metrics: AgentMetrics): ScoredAgent {
  const total = metrics.tasksCompleted + metrics.tasksFailed;
  const completionRate = total === 0 ? 0 : metrics.tasksCompleted / total;

  let score = 700;
  score += completionRate * 200;
  score -= metrics.disputes * 25;
  score -= metrics.slashes * 50;
  score += Math.min(metrics.ageDays / 30, 1) * 50;

  const clamped = Math.max(300, Math.min(950, score));
  const rounded = Math.round(clamped);

  return {
    ...metrics,
    score: rounded,
    tier: getTier(rounded),
    completionRate,
  };
}

/** Hours since timestamp (ms); 0 if invalid. */
function hoursSince(ms: number): number {
  if (!ms || ms <= 0) return 24 * 365; // treat missing as very old
  return (Date.now() - ms) / (1000 * 60 * 60);
}

/**
 * Score agents without wallet using Moltbook-only signals: recency + post count in feed.
 * Same 300–950 range and tiers so the leaderboard works; completionRate = 0 (no onchain data).
 */
export function calculateActivityScore(agent: DiscoveredAgent): ScoredAgent {
  const hours = hoursSince(agent.lastPostAt ?? 0);
  const recencyScore = Math.max(0, 100 - hours * 4); // 100 at 0h, 0 at 25h
  const postCount = Math.min(agent.postCountInFeed ?? 0, 20);
  const activityScore = postCount * 4; // 0–80 from feed presence
  const raw = 400 + recencyScore * 3 + activityScore * 2; // base 400, recency + activity
  const score = Math.max(300, Math.min(950, Math.round(raw)));
  return {
    wallet: agent.wallet ?? "",
    tasksCompleted: 0,
    tasksFailed: 0,
    disputes: 0,
    slashes: 0,
    ageDays: 0,
    score,
    tier: getTier(score),
    completionRate: 0,
    username: agent.username,
    lastPostAt: agent.lastPostAt,
  };
}
