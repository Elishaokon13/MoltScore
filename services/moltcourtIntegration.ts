/**
 * MoltCourt integration: fetch agent data and compute debate score for enhanced scoring.
 * Public API: https://moltcourt.fun/api
 */

const MOLTCOURT_API = "https://moltcourt.fun/api";

export interface MoltCourtMetrics {
  username: string;
  totalDebates: number;
  wins: number;
  losses: number;
  winRate: number;
  avgJuryScore: number;
  normalizedJuryScore: number;
  leaderboardRank?: number;
  lastFightAt?: Date;
  forfeitRate: number;
  avgScoreByCategory: { logic: number; evidence: number; rebuttal: number; clarity: number };
}

const LOG = "[MoltCourtIntegration]";

/** Fetch leaderboard and find agent by moltbook_username or name (case-insensitive). */
export async function fetchMoltCourtAgent(username: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${MOLTCOURT_API}/leaderboard?limit=1000`);
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim().startsWith("{")) return null;
    const data = JSON.parse(text) as { leaderboard?: Record<string, unknown>[]; agents?: Record<string, unknown>[] };
    const list = data.leaderboard ?? data.agents ?? [];
    const key = username.toLowerCase();
    const found = (list as Record<string, unknown>[]).find(
      (a: Record<string, unknown>) =>
        (String(a.moltbook_username ?? "").toLowerCase() === key) ||
        (String(a.name ?? "").toLowerCase() === key) ||
        (String(a.agent_name ?? "").toLowerCase() === key)
    );
    return found ?? null;
  } catch (e) {
    console.warn(LOG, "fetchMoltCourtAgent failed", { username, error: String(e) });
    return null;
  }
}

export async function getMoltCourtMetrics(username: string): Promise<MoltCourtMetrics | null> {
  const agent = await fetchMoltCourtAgent(username);
  if (!agent) return null;

  const wins = Number(agent.wins ?? 0);
  const losses = Number(agent.losses ?? 0);
  const totalFights = Number(agent.total_fights ?? 0) || wins + losses;
  const winRate = totalFights > 0 ? wins / totalFights : 0;
  const avgJuryScore = Number(agent.avg_jury_score ?? 0);
  const normalizedJuryScore = avgJuryScore > 0 ? Math.min(1, avgJuryScore / 40) : 0;

  return {
    username,
    totalDebates: totalFights,
    wins,
    losses,
    winRate,
    avgJuryScore,
    normalizedJuryScore,
    leaderboardRank: agent.leaderboard_rank != null ? Number(agent.leaderboard_rank) : undefined,
    lastFightAt: agent.last_fight_at ? new Date(String(agent.last_fight_at)) : undefined,
    forfeitRate: 0,
    avgScoreByCategory: { logic: 0, evidence: 0, rebuttal: 0, clarity: 0 },
  };
}

/** Debate score 0–1 for intellectual reputation component (max 150 points when scaled). */
export function calculateDebateScore(metrics: MoltCourtMetrics): number {
  if (metrics.totalDebates === 0) return 0;

  let score =
    metrics.winRate * 0.4 +
    metrics.normalizedJuryScore * 0.3 +
    Math.min(metrics.totalDebates / 20, 1) * 0.15 +
    (1 - metrics.forfeitRate) * 0.15;

  if (metrics.leaderboardRank != null && metrics.leaderboardRank <= 3) score += 0.1;
  else if (metrics.leaderboardRank != null && metrics.leaderboardRank <= 10) score += 0.05;
  if (metrics.avgJuryScore > 32) score += 0.05;

  if (metrics.lastFightAt) {
    const daysSince = (Date.now() - metrics.lastFightAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince > 30) score -= 0.1;
  }

  return Math.max(0, Math.min(1, score));
}
