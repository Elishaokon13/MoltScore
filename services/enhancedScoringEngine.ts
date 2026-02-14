/**
 * Enhanced scoring: 5 components, 1000 pts scaled to 300–950.
 * Task 20%, Financial 30%, Dispute 15%, Ecosystem 20%, Intellectual 15%.
 */

import type { AgentMetrics } from "@/lib/types";
import { getMoltCourtMetrics, calculateDebateScore } from "./moltcourtIntegration";
import { getBankrMetrics, calculateFinancialScore } from "./bankrIntegration";

export interface EnhancedScore {
  overallScore: number;
  tier: string;
  components: {
    taskPerformance: number;
    financialReliability: number;
    disputeRecord: number;
    ecosystemParticipation: number;
    intellectualReputation: number;
  };
  metadata: {
    hasOnchainData: boolean;
    hasDebateData: boolean;
    hasBankrData: boolean;
    dataCompleteness: number;
  };
}

const TIER_BANDS: [number, string][] = [
  [900, "AAA - Elite"],
  [850, "AA - Exceptional"],
  [800, "A+ - Excellent"],
  [750, "A - Very Good"],
  [700, "A- - Good"],
  [650, "BBB+ - Above Average"],
  [600, "BBB - Average"],
  [550, "BBB- - Fair"],
  [500, "BB - Below Average"],
  [450, "B - Poor"],
  [400, "C - High Risk"],
  [300, "D - Risk Watch"],
];

function determineTier(score: number): string {
  for (const [min, tier] of TIER_BANDS) {
    if (score >= min) return tier;
  }
  return "D - Risk Watch";
}

function calculateTaskPerformance(metrics: AgentMetrics): number {
  const total = metrics.tasksCompleted + metrics.tasksFailed;
  if (total === 0) return 0;
  const completionRate = metrics.tasksCompleted / total;
  const volumeBonus = Math.min(total / 50, 1) * 0.2;
  return Math.min(1, completionRate * 0.8 + volumeBonus);
}

function calculateDisputeRecord(metrics: AgentMetrics): number {
  if (metrics.disputes === 0) return 1;
  if (metrics.disputes <= 2) return 0.7;
  if (metrics.disputes <= 5) return 0.4;
  return 0.2;
}

function calculateEcosystemParticipation(metrics: AgentMetrics): number {
  const ageScore = Math.min(metrics.ageDays / 180, 1) * 0.5;
  const recencyScore = 0.5;
  return ageScore + recencyScore;
}

/**
 * Compute enhanced score for one agent. Uses MoltCourt and Bankr when available.
 */
export async function calculateEnhancedScore(
  username: string,
  wallet: string | undefined,
  onchainMetrics: AgentMetrics,
  bankrApiKey?: string
): Promise<EnhancedScore> {
  const taskPerf = calculateTaskPerformance(onchainMetrics);
  const taskScore = taskPerf * 200;

  let financialScore = 0;
  let hasBankrData = false;
  if (wallet?.trim() && bankrApiKey?.trim()) {
    const bankrMetrics = await getBankrMetrics(bankrApiKey, wallet);
    if (bankrMetrics) {
      const fin = calculateFinancialScore(bankrMetrics);
      financialScore = fin * 300;
      hasBankrData = true;
    }
  }
  if (financialScore === 0) {
    const slashScore =
      onchainMetrics.slashes === 0 ? 1 : Math.max(0.2, 1 - onchainMetrics.slashes * 0.2);
    financialScore = slashScore * 300;
  }

  const disputeScore = calculateDisputeRecord(onchainMetrics) * 150;
  const ecosystemScore = calculateEcosystemParticipation(onchainMetrics) * 200;

  let intellectualScore = 0;
  let hasDebateData = false;
  const moltcourtMetrics = await getMoltCourtMetrics(username);
  if (moltcourtMetrics && moltcourtMetrics.totalDebates > 0) {
    const debateScore = calculateDebateScore(moltcourtMetrics);
    intellectualScore = debateScore * 150;
    hasDebateData = true;
  }

  const rawScore =
    taskScore + financialScore + disputeScore + ecosystemScore + intellectualScore;
  const overallScore = Math.round(Math.max(300, Math.min(950, rawScore)));

  let completeness = 0;
  if (onchainMetrics.tasksCompleted + onchainMetrics.tasksFailed > 0) completeness += 0.4;
  if (hasBankrData) completeness += 0.3;
  if (hasDebateData) completeness += 0.3;

  return {
    overallScore,
    tier: determineTier(overallScore),
    components: {
      taskPerformance: taskScore,
      financialReliability: financialScore,
      disputeRecord: disputeScore,
      ecosystemParticipation: ecosystemScore,
      intellectualReputation: intellectualScore,
    },
    metadata: {
      hasOnchainData: onchainMetrics.tasksCompleted + onchainMetrics.tasksFailed > 0,
      hasDebateData,
      hasBankrData,
      dataCompleteness: completeness,
    },
  };
}
