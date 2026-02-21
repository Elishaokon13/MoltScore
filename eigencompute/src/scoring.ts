/**
 * Deterministic reputation scoring algorithm.
 *
 * Reads on-chain data from Mandate Protocol contracts (Identity, Reputation, Escrow)
 * and produces a verifiable reputation score (0–100 scale).
 *
 * This runs inside an EigenCompute TEE, so the output is cryptographically
 * attested — anyone can verify the exact code that produced a given score.
 *
 * Scoring components:
 *   1. Peer Reputation (40%) — on-chain reviews via Reputation Registry
 *   2. Task Completion (30%) — escrow mandate completions
 *   3. Economic Activity (20%) — total escrow value transacted
 *   4. Identity Completeness (10%) — metadata, skills, verification
 */

import { ethers } from "ethers";

/* ---------- Contract addresses (Base Mainnet) ---------- */

export const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
export const REPUTATION_REGISTRY = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63";
export const ESCROW_CONTRACT = "0x5Df1ffa02c8515a0Fed7d0e5d6375FcD2c1950Ee";

/* ---------- Minimal ABIs ---------- */

const IDENTITY_ABI = [
  "function tokenURI(uint256 agentId) view returns (string)",
  "function getAgentWallet(uint256 agentId) view returns (address)",
  "function ownerOf(uint256 agentId) view returns (address)",
];

const REPUTATION_ABI = [
  "function getClients(uint256 agentId) view returns (address[])",
  "function getSummary(uint256 agentId, address[] clientAddresses, string tag1, string tag2) view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals)",
];

/* ---------- Types ---------- */

export interface ScoreInput {
  agentId: number;
  feedbackCount: number;
  feedbackValue: number;
  completedMandates: number;
  totalMandates: number;
  totalEscrowWei: bigint;
  hasMetadata: boolean;
  hasSkills: boolean;
  ownerVerified: boolean;
}

export interface ScoreOutput {
  agentId: number;
  score: number;
  components: {
    peerReputation: number;
    taskCompletion: number;
    economicActivity: number;
    identityCompleteness: number;
  };
  input: ScoreInput;
  timestamp: number;
  version: string;
}

const SCORING_VERSION = "1.0.0";

/* ---------- Deterministic scoring function ---------- */

export function computeScore(input: ScoreInput): ScoreOutput {
  // 1. Peer Reputation (0–40 points)
  // Based on feedback count and average value
  let peerReputation = 0;
  if (input.feedbackCount > 0) {
    const avgValue = input.feedbackValue / input.feedbackCount;
    // Normalize avg value to 0–1 (assuming max ~100)
    const normalizedAvg = Math.min(1, Math.max(0, avgValue / 100));
    // Count bonus: log scale, max ~15 points for 50+ reviews
    const countBonus = Math.min(15, Math.log2(input.feedbackCount + 1) * 2.5);
    peerReputation = Math.round(normalizedAvg * 25 + countBonus);
  }

  // 2. Task Completion (0–30 points)
  let taskCompletion = 0;
  if (input.totalMandates > 0) {
    const completionRate = input.completedMandates / input.totalMandates;
    // Volume bonus: log scale, max ~10 points for 20+ tasks
    const volumeBonus = Math.min(10, Math.log2(input.completedMandates + 1) * 2.3);
    taskCompletion = Math.round(completionRate * 20 + volumeBonus);
  }

  // 3. Economic Activity (0–20 points)
  let economicActivity = 0;
  if (input.totalEscrowWei > 0n) {
    const ethValue = Number(input.totalEscrowWei) / 1e18;
    // Log scale: 0.01 ETH = ~6pts, 0.1 ETH = ~10pts, 1 ETH = ~15pts, 10 ETH = ~20pts
    economicActivity = Math.min(20, Math.round(Math.log10(ethValue * 100 + 1) * 5));
  }

  // 4. Identity Completeness (0–10 points)
  let identityCompleteness = 2; // Base: registered on-chain
  if (input.hasMetadata) identityCompleteness += 3;
  if (input.hasSkills) identityCompleteness += 3;
  if (input.ownerVerified) identityCompleteness += 2;

  const score = Math.min(100, peerReputation + taskCompletion + economicActivity + identityCompleteness);

  return {
    agentId: input.agentId,
    score,
    components: {
      peerReputation,
      taskCompletion,
      economicActivity,
      identityCompleteness,
    },
    input,
    timestamp: Math.floor(Date.now() / 1000),
    version: SCORING_VERSION,
  };
}

/* ---------- On-chain data fetching ---------- */

export async function fetchScoreInput(
  provider: ethers.JsonRpcProvider,
  agentId: number
): Promise<ScoreInput> {
  const identity = new ethers.Contract(IDENTITY_REGISTRY, IDENTITY_ABI, provider);
  const reputation = new ethers.Contract(REPUTATION_REGISTRY, REPUTATION_ABI, provider);

  // Fetch identity data
  let hasMetadata = false;
  let hasSkills = false;
  let ownerVerified = false;

  try {
    const uri = await identity.tokenURI(agentId);
    hasMetadata = uri && uri.length > 0;
    // Check if URI contains skill/endpoint data
    if (uri && (uri.includes("skills") || uri.includes("endpoint"))) {
      hasSkills = true;
    }
  } catch {
    // Agent may not exist
  }

  try {
    const owner = await identity.ownerOf(agentId);
    ownerVerified = owner && owner !== ethers.ZeroAddress;
  } catch {
    // Not found
  }

  // Fetch reputation data from Mandate Protocol's ON-CHAIN Reputation Registry only.
  // MoltLaunch API reputation (rep_count, rep_summary_value) comes from their backend;
  // if that data is not written to this contract, getClients will be empty and we get 0/40.
  let feedbackCount = 0;
  let feedbackValue = 0;

  try {
    const clients: string[] = await reputation.getClients(agentId);
    if (clients.length > 0) {
      const [count, summaryValue] = await reputation.getSummary(
        agentId,
        clients,
        "",
        ""
      );
      feedbackCount = Number(count);
      feedbackValue = Number(summaryValue);
    }
  } catch (e) {
    // No reputation data or RPC error (e.g. agent not in this registry)
  }

  // Task completion & economic activity: Escrow (MandateEscrowV5) data is NOT yet wired.
  // The contract is unverified; fetching mandates per agent requires event indexing or a
  // dedicated indexer. Until then, completedMandates/totalMandates/totalEscrowWei are 0,
  // so the score only reflects: (1) Peer reputation from Reputation Registry, (2) Identity completeness.
  return {
    agentId,
    feedbackCount,
    feedbackValue,
    completedMandates: 0,
    totalMandates: 0,
    totalEscrowWei: 0n,
    hasMetadata,
    hasSkills,
    ownerVerified,
  };
}
