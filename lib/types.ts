/**
 * Shared types for MoltScore autonomous pipeline.
 */

export interface DiscoveredAgent {
  username: string;
  wallet?: string;
  /** Timestamp (ms) of agent's most recent post in the feed; used for "posted within 6h" rule. */
  lastPostAt?: number;
}

export interface AgentMetrics {
  wallet: string;
  tasksCompleted: number;
  tasksFailed: number;
  disputes: number;
  slashes: number;
  ageDays: number;
}

export interface ScoredAgent extends AgentMetrics {
  score: number;
  tier: string;
  completionRate: number;
  username?: string;
  /** When the agent last posted (ms); set from discovery for reply window rule. */
  lastPostAt?: number;
}
