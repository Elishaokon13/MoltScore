/**
 * MoltScore formula and tier assignment.
 */

import type { AgentMetrics, ScoredAgent } from "@/lib/types";

const TIERS = [
  [850, "AAA"],
  [800, "AA"],
  [750, "A"],
  [700, "BBB"],
  [650, "BB"],
] as const;

function getTier(score: number): string {
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
