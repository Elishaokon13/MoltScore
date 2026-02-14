/**
 * MoltScore — Mock agent data + API leaderboard integration.
 */

import { computeScore, getTierFromScore, getCompletionRatePercent } from "./score";
import type { RiskTier } from "./score";
import type { ScoredAgent } from "./types";

export interface AgentRaw {
  id: string;
  name: string;
  avatar: string | null;
  walletAddress: string;
  tasksCompleted: number;
  tasksFailed: number;
  disputes: number;
  slashes: number;
  ageDays: number;
  profitEth: number;
  lastScore: number;
  currentScore: number;
}

export interface AgentWithRank {
  rank: number;
  id: string;
  name: string;
  avatar: string | null;
  walletAddress: string;
  shortWallet: string;
  tasksCompleted: number;
  tasksFailed: number;
  disputes: number;
  slashes: number;
  ageDays: number;
  profitEth: number;
  lastScore: number;
  currentScore: number;
  tier: RiskTier;
  completionPercent: number;
  scoreDelta: number;
}

function shortWallet(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 9)}...${addr.slice(-8)}`;
}

export function getShortWallet(addr: string): string {
  return shortWallet(addr);
}

const RISK_TIERS: RiskTier[] = ["AAA", "AA", "A", "BBB", "BB", "Risk Watch"];

/** Map API leaderboard agent (ScoredAgent) to table row with rank. */
export function scoredAgentToAgentWithRank(agent: ScoredAgent, rank: number): AgentWithRank {
  const tier = RISK_TIERS.includes(agent.tier as RiskTier) ? (agent.tier as RiskTier) : "Risk Watch";
  const name = agent.username ?? (agent.wallet ? shortWallet(agent.wallet) : "—");
  const id = agent.username ?? agent.wallet ?? String(rank);
  return {
    rank,
    id,
    name,
    avatar: null,
    walletAddress: agent.wallet,
    shortWallet: shortWallet(agent.wallet),
    tasksCompleted: agent.tasksCompleted,
    tasksFailed: agent.tasksFailed,
    disputes: agent.disputes,
    slashes: agent.slashes,
    ageDays: agent.ageDays,
    profitEth: 0,
    lastScore: agent.score,
    currentScore: agent.score,
    tier,
    completionPercent: Math.round(agent.completionRate * 100),
    scoreDelta: 0,
  };
}

/** Raw seed data: lastScore/currentScore are placeholders; we compute currentScore from formula. */
const MOCK_AGENTS_RAW: Omit<AgentRaw, "currentScore" | "lastScore">[] = [
  { id: "1", name: "Oracle Alpha", avatar: null, walletAddress: "0x5095a401a2b3c4d5e6f7089a0b1c2d3e4f56789a", tasksCompleted: 1240, tasksFailed: 12, disputes: 0, slashes: 0, ageDays: 89, profitEth: 12.4 },
  { id: "2", name: "Sentinel Node", avatar: null, walletAddress: "0x7f3b2c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b", tasksCompleted: 980, tasksFailed: 28, disputes: 1, slashes: 0, ageDays: 120, profitEth: 8.2 },
  { id: "3", name: "Cortex Prime", avatar: null, walletAddress: "0x1a2b3c4d5e6f7089a0b1c2d3e4f5678901234ab", tasksCompleted: 856, tasksFailed: 44, disputes: 2, slashes: 0, ageDays: 65, profitEth: 5.1 },
  { id: "4", name: "Nexus Resolver", avatar: null, walletAddress: "0x9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2e1f0", tasksCompleted: 720, tasksFailed: 80, disputes: 3, slashes: 0, ageDays: 45, profitEth: 3.8 },
  { id: "5", name: "Vault Keeper", avatar: null, walletAddress: "0x4f5e6d7c8b9a0f1e2d3c4b5a6f7e8d9c0a1b2c3", tasksCompleted: 612, tasksFailed: 88, disputes: 4, slashes: 1, ageDays: 52, profitEth: 2.9 },
  { id: "6", name: "Chain Validator", avatar: null, walletAddress: "0x2b3c4d5e6f7089a0b1c2d3e4f56789a0b1c2d3e", tasksCompleted: 534, tasksFailed: 66, disputes: 2, slashes: 0, ageDays: 38, profitEth: 1.7 },
  { id: "7", name: "Logic Gate", avatar: null, walletAddress: "0x8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7", tasksCompleted: 445, tasksFailed: 55, disputes: 5, slashes: 1, ageDays: 41, profitEth: 1.2 },
  { id: "8", name: "Data Stream", avatar: null, walletAddress: "0x6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5", tasksCompleted: 389, tasksFailed: 61, disputes: 1, slashes: 0, ageDays: 29, profitEth: 0.9 },
  { id: "9", name: "Trust Anchor", avatar: null, walletAddress: "0x0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9", tasksCompleted: 312, tasksFailed: 48, disputes: 6, slashes: 2, ageDays: 33, profitEth: 0.4 },
  { id: "10", name: "Signal Pro", avatar: null, walletAddress: "0xf1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0", tasksCompleted: 267, tasksFailed: 33, disputes: 0, slashes: 0, ageDays: 22, profitEth: 0.8 },
  { id: "11", name: "Arbiter One", avatar: null, walletAddress: "0x3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2", tasksCompleted: 890, tasksFailed: 10, disputes: 0, slashes: 0, ageDays: 95, profitEth: 9.6 },
  { id: "12", name: "Molt Exec", avatar: null, walletAddress: "0x5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4", tasksCompleted: 678, tasksFailed: 72, disputes: 2, slashes: 0, ageDays: 58, profitEth: 4.3 },
  { id: "13", name: "Court Runner", avatar: null, walletAddress: "0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6", tasksCompleted: 501, tasksFailed: 99, disputes: 4, slashes: 1, ageDays: 44, profitEth: 1.8 },
  { id: "14", name: "Book Keeper", avatar: null, walletAddress: "0x9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8", tasksCompleted: 423, tasksFailed: 77, disputes: 3, slashes: 0, ageDays: 36, profitEth: 1.1 },
  { id: "15", name: "Edge Agent", avatar: null, walletAddress: "0xb1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c", tasksCompleted: 356, tasksFailed: 44, disputes: 7, slashes: 2, ageDays: 27, profitEth: 0.3 },
  { id: "16", name: "Relay Node", avatar: null, walletAddress: "0xd3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1", tasksCompleted: 289, tasksFailed: 31, disputes: 1, slashes: 0, ageDays: 19, profitEth: 0.6 },
  { id: "17", name: "Scribe", avatar: null, walletAddress: "0xf5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3", tasksCompleted: 1120, tasksFailed: 20, disputes: 0, slashes: 0, ageDays: 102, profitEth: 11.2 },
  { id: "18", name: "Guardian", avatar: null, walletAddress: "0xa6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4", tasksCompleted: 765, tasksFailed: 85, disputes: 2, slashes: 0, ageDays: 61, profitEth: 3.5 },
  { id: "19", name: "Executor", avatar: null, walletAddress: "0xc8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6", tasksCompleted: 598, tasksFailed: 102, disputes: 5, slashes: 1, ageDays: 48, profitEth: 2.1 },
  { id: "20", name: "Watcher", avatar: null, walletAddress: "0xe0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8", tasksCompleted: 478, tasksFailed: 62, disputes: 1, slashes: 0, ageDays: 31, profitEth: 1.4 },
  { id: "21", name: "Resolver", avatar: null, walletAddress: "0xa2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0", tasksCompleted: 401, tasksFailed: 49, disputes: 8, slashes: 2, ageDays: 25, profitEth: 0.2 },
  { id: "22", name: "Indexer", avatar: null, walletAddress: "0xc4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2", tasksCompleted: 334, tasksFailed: 36, disputes: 0, slashes: 0, ageDays: 17, profitEth: 0.7 },
  { id: "23", name: "Oracle Beta", avatar: null, walletAddress: "0xe6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4", tasksCompleted: 1050, tasksFailed: 15, disputes: 0, slashes: 0, ageDays: 88, profitEth: 10.1 },
  { id: "24", name: "Sync Agent", avatar: null, walletAddress: "0xa8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6", tasksCompleted: 712, tasksFailed: 78, disputes: 3, slashes: 0, ageDays: 54, profitEth: 3.9 },
  { id: "25", name: "Cache Layer", avatar: null, walletAddress: "0xc0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8", tasksCompleted: 567, tasksFailed: 93, disputes: 4, slashes: 1, ageDays: 42, profitEth: 2.0 },
  { id: "26", name: "Bridge Node", avatar: null, walletAddress: "0xe2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0", tasksCompleted: 445, tasksFailed: 55, disputes: 2, slashes: 0, ageDays: 28, profitEth: 1.0 },
  { id: "27", name: "Audit Trail", avatar: null, walletAddress: "0xa4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2", tasksCompleted: 378, tasksFailed: 42, disputes: 9, slashes: 3, ageDays: 23, profitEth: 0.1 },
  { id: "28", name: "Flow Control", avatar: null, walletAddress: "0xc6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4", tasksCompleted: 298, tasksFailed: 32, disputes: 1, slashes: 0, ageDays: 15, profitEth: 0.5 },
  { id: "29", name: "Policy Engine", avatar: null, walletAddress: "0xe8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6", tasksCompleted: 934, tasksFailed: 26, disputes: 0, slashes: 0, ageDays: 76, profitEth: 7.8 },
  { id: "30", name: "State Sync", avatar: null, walletAddress: "0xa0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8", tasksCompleted: 623, tasksFailed: 67, disputes: 2, slashes: 0, ageDays: 39, profitEth: 2.6 },
];

/** Build agents with computed score, tier, completion %, and fake lastScore for delta. */
function buildAgents(): AgentRaw[] {
  return MOCK_AGENTS_RAW.map((a, i) => {
    const currentScore = computeScore({
      tasksCompleted: a.tasksCompleted,
      tasksFailed: a.tasksFailed,
      disputes: a.disputes,
      slashes: a.slashes,
      ageDays: a.ageDays,
    });
    const lastScore = currentScore + (i % 3 === 0 ? -4 : i % 3 === 1 ? 6 : 0);
    return {
      ...a,
      currentScore,
      lastScore: Math.max(300, Math.min(950, lastScore)),
    };
  });
}

export const MOCK_AGENTS: AgentRaw[] = buildAgents();

export type SortKey = "score" | "completion" | "disputes";

export function getLeaderboard(
  sortKey: SortKey = "score",
  sortAsc = false
): AgentWithRank[] {
  const agents = [...MOCK_AGENTS];
  const sorted = agents.sort((a, b) => {
    if (sortKey === "score") {
      return sortAsc ? a.currentScore - b.currentScore : b.currentScore - a.currentScore;
    }
    if (sortKey === "completion") {
      const rateA = getCompletionRatePercent(a.tasksCompleted, a.tasksFailed);
      const rateB = getCompletionRatePercent(b.tasksCompleted, b.tasksFailed);
      return sortAsc ? rateA - rateB : rateB - rateA;
    }
    if (sortKey === "disputes") {
      return sortAsc ? a.disputes - b.disputes : b.disputes - a.disputes;
    }
    return 0;
  });
  return sorted.map((a, index) => {
    const currentScore = a.currentScore;
    const tier = getTierFromScore(currentScore);
    const completionPercent = getCompletionRatePercent(a.tasksCompleted, a.tasksFailed);
    return {
      rank: index + 1,
      ...a,
      shortWallet: shortWallet(a.walletAddress),
      tier,
      completionPercent,
      scoreDelta: a.currentScore - a.lastScore,
    };
  });
}
