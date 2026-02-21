/**
 * Build ScoreInput for the EigenCompute TEE (POST /score).
 * Uses on-chain data first; when on-chain reputation is empty, falls back to
 * MoltLaunch API so the attested score is "on-chain + attested off-chain".
 */

import { ethers } from "ethers";
import {
  getIdentityContract,
  readReputationSummary,
  type ReputationSummary,
} from "@/services/mandateContracts";
import { fetchAgentById } from "@/lib/moltlaunchApi";

export interface ScoreInputForTee {
  agentId: number;
  feedbackCount: number;
  feedbackValue: number;
  completedMandates: number;
  totalMandates: number;
  totalEscrowWei: string; // JSON-safe (bigint as string)
  hasMetadata: boolean;
  hasSkills: boolean;
  ownerVerified: boolean;
}

export type ReputationSource = "onchain" | "moltlaunch";

export interface BuildScoreInputResult {
  input: ScoreInputForTee;
  reputationSource: ReputationSource;
}

/**
 * Build ScoreInput for the given agent.
 * - Identity: always from on-chain (Identity registry).
 * - Reputation & tasks: when MoltLaunch data is available, use it so the TEE score aligns with
 *   what the page shows (MoltLaunch rep, completed/active tasks). Otherwise use on-chain rep only.
 */
export async function buildScoreInputForTee(
  agentId: number
): Promise<BuildScoreInputResult> {
  let feedbackCount = 0;
  let feedbackValue = 0;
  let reputationSource: ReputationSource = "onchain";
  let completedMandates = 0;
  let totalMandates = 0;

  const onChainRep: ReputationSummary | null = await readReputationSummary(agentId);
  const moltAgent = await fetchAgentById(agentId);

  if (moltAgent) {
    completedMandates = moltAgent.completedTasks ?? 0;
    totalMandates = completedMandates + (moltAgent.activeTasks ?? 0);
    if (moltAgent.reputation && (moltAgent.reputation.count > 0 || moltAgent.reputation.summaryValue > 0)) {
      feedbackCount = moltAgent.reputation.count ?? 0;
      feedbackValue = moltAgent.reputation.summaryValue ?? 0;
      reputationSource = "moltlaunch";
    }
  }
  if (reputationSource !== "moltlaunch" && onChainRep && onChainRep.count > 0) {
    feedbackCount = onChainRep.count;
    feedbackValue = Number(onChainRep.summaryValue);
    reputationSource = "onchain";
  }

  let hasMetadata = false;
  let hasSkills = false;
  let ownerVerified = false;

  const identity = getIdentityContract();
  if (identity) {
    try {
      const [uri, owner] = await Promise.all([
        identity.tokenURI(agentId).catch(() => ""),
        identity.ownerOf(agentId).catch(() => ethers.ZeroAddress),
      ]);
      hasMetadata = Boolean(uri && uri.length > 0);
      if (uri && (uri.includes("skills") || uri.includes("endpoint"))) {
        hasSkills = true;
      }
      ownerVerified = Boolean(owner && owner !== ethers.ZeroAddress);
    } catch {
      // Agent may not exist on-chain
    }
  }

  const input: ScoreInputForTee = {
    agentId,
    feedbackCount,
    feedbackValue,
    completedMandates,
    totalMandates,
    totalEscrowWei: "0",
    hasMetadata,
    hasSkills,
    ownerVerified,
  };

  return { input, reputationSource };
}
