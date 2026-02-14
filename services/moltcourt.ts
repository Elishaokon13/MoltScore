/**
 * MoltCourt leaderboard fetch. Public API, no auth.
 * Used to add a debate-reputation bonus to agent ranking.
 */

const MOLTCOURT_LEADERBOARD_URL = "https://moltcourt.fun/api/leaderboard?limit=100";

export interface MoltCourtEntry {
  rank: number;
  name: string;
  reputation: number;
  wins: number;
  losses: number;
  winRate: string;
}

const LOG = "[MoltCourt]";

/** Fetch leaderboard; returns map of agent name (as returned by API) -> entry. Names normalized to lowercase for matching. */
export async function fetchMoltCourtLeaderboard(): Promise<Map<string, MoltCourtEntry>> {
  const map = new Map<string, MoltCourtEntry>();
  try {
    const res = await fetch(MOLTCOURT_LEADERBOARD_URL);
    if (!res.ok) return map;
    const text = await res.text();
    if (!text.trim().startsWith("{")) return map;
    const data = JSON.parse(text) as { leaderboard?: { rank: number; name: string; reputation: number; wins: number; losses: number; winRate: string }[] };
    for (const row of data.leaderboard ?? []) {
      const name = (row.name ?? "").trim();
      if (name) {
        const entry: MoltCourtEntry = {
          rank: row.rank,
          name: row.name,
          reputation: row.reputation ?? 0,
          wins: row.wins ?? 0,
          losses: row.losses ?? 0,
          winRate: row.winRate ?? "0",
        };
        map.set(name.toLowerCase(), entry);
      }
    }
    console.info(LOG, "fetched", { count: map.size });
  } catch (e) {
    console.warn(LOG, "fetch failed", { error: String(e) });
  }
  return map;
}

/** Reputation in sample is ~980–1200. Normalize to a score bonus (0–maxBonus). */
export function reputationToBonus(reputation: number, maxBonus: number = 40): number {
  const minRep = 980;
  const maxRep = 1200;
  const t = (reputation - minRep) / (maxRep - minRep);
  return Math.round(Math.max(0, Math.min(1, t)) * maxBonus);
}
