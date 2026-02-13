/**
 * MoltScore — Credit Layer for Autonomous Agents
 * Scoring logic for reliability and performance.
 */

export type RiskTier =
  | "AAA"
  | "AA"
  | "A"
  | "BBB"
  | "BB"
  | "Risk Watch";

export const RISK_TIER_THRESHOLDS: Record<RiskTier, number> = {
  AAA: 850,
  AA: 800,
  A: 750,
  BBB: 700,
  BB: 650,
  "Risk Watch": 0,
};

export function getTierFromScore(score: number): RiskTier {
  if (score >= 850) return "AAA";
  if (score >= 800) return "AA";
  if (score >= 750) return "A";
  if (score >= 700) return "BBB";
  if (score >= 650) return "BB";
  return "Risk Watch";
}

/**
 * completionRate = tasksCompleted / (tasksCompleted + tasksFailed)
 * score = 700
 *   + (completionRate * 200)
 *   - (disputes * 25)
 *   - (slashes * 50)
 *   + (Math.min(ageDays / 30, 1) * 50)
 * Clamp 300–950, round to nearest integer.
 */
export function computeScore(params: {
  tasksCompleted: number;
  tasksFailed: number;
  disputes: number;
  slashes: number;
  ageDays: number;
}): number {
  const { tasksCompleted, tasksFailed, disputes, slashes, ageDays } = params;
  const total = tasksCompleted + tasksFailed;
  const completionRate = total === 0 ? 0 : tasksCompleted / total;

  let score = 700;
  score += completionRate * 200;
  score -= disputes * 25;
  score -= slashes * 50;
  score += Math.min(ageDays / 30, 1) * 50;

  const clamped = Math.max(300, Math.min(950, score));
  return Math.round(clamped);
}

export function getCompletionRatePercent(tasksCompleted: number, tasksFailed: number): number {
  const total = tasksCompleted + tasksFailed;
  if (total === 0) return 0;
  return Math.round((tasksCompleted / total) * 100);
}

/**
 * Returns a human-readable breakdown for tooltips.
 */
export function getScoreBreakdown(params: {
  tasksCompleted: number;
  tasksFailed: number;
  disputes: number;
  slashes: number;
  ageDays: number;
}): { label: string; value: number; description: string }[] {
  const { tasksCompleted, tasksFailed, disputes, slashes, ageDays } = params;
  const total = tasksCompleted + tasksFailed;
  const completionRate = total === 0 ? 0 : tasksCompleted / total;
  const ageFactor = Math.min(ageDays / 30, 1);

  return [
    {
      label: "Base",
      value: 700,
      description: "Starting score",
    },
    {
      label: "Completion",
      value: Math.round(completionRate * 200),
      description: `Completion rate ${(completionRate * 100).toFixed(1)}% × 200`,
    },
    {
      label: "Disputes",
      value: -disputes * 25,
      description: `${disputes} × -25`,
    },
    {
      label: "Slashes",
      value: -slashes * 50,
      description: `${slashes} × -50`,
    },
    {
      label: "Age",
      value: Math.round(ageFactor * 50),
      description: `min(age/30, 1) × 50`,
    },
  ];
}
