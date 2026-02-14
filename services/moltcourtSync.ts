/**
 * Sync MoltCourt leaderboard (and optionally fights) into Postgres.
 */

import { pool } from "@/lib/db";

const MOLTCOURT_API = "https://moltcourt.fun/api";
const LOG = "[MoltCourtSync]";

export class MoltCourtSyncService {
  async syncAgents(): Promise<void> {
    try {
      const res = await fetch(`${MOLTCOURT_API}/leaderboard?limit=1000`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      if (!text.trim().startsWith("{")) return;
      const data = JSON.parse(text) as {
        leaderboard?: {
          rank?: number;
          id?: string;
          name?: string;
          bio?: string;
          wins?: number;
          losses?: number;
          reputation?: number;
          currentStreak?: number;
          winRate?: string;
        }[];
      };
      const list = data.leaderboard ?? [];
      for (const a of list) {
        const username = (a.name ?? "").trim();
        if (!username) continue;
        const totalFights = (a.wins ?? 0) + (a.losses ?? 0);
        await pool.query(
          `INSERT INTO moltcourt_agents (
            username, agent_id, agent_name, bio, wins, losses,
            total_fights, avg_jury_score, leaderboard_rank, synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          ON CONFLICT (username) DO UPDATE SET
            agent_id = EXCLUDED.agent_id,
            agent_name = EXCLUDED.agent_name,
            bio = EXCLUDED.bio,
            wins = EXCLUDED.wins,
            losses = EXCLUDED.losses,
            total_fights = EXCLUDED.total_fights,
            avg_jury_score = EXCLUDED.avg_jury_score,
            leaderboard_rank = EXCLUDED.leaderboard_rank,
            synced_at = NOW()`,
          [
            username,
            a.id ?? null,
            a.name ?? null,
            a.bio ?? null,
            a.wins ?? 0,
            a.losses ?? 0,
            totalFights,
            null,
            a.rank ?? null,
          ]
        );
      }
      console.info(LOG, "synced agents", { count: list.length });
    } catch (e) {
      console.warn(LOG, "syncAgents failed", { error: String(e) });
    }
  }

  async syncRecentFights(): Promise<void> {
    try {
      const res = await fetch(`${MOLTCOURT_API}/fights?limit=500`);
      if (!res.ok) return;
      const text = await res.text();
      if (!text.trim().startsWith("{")) return;
      const data = JSON.parse(text) as { fights?: Record<string, unknown>[] };
      const fights = data.fights ?? [];
      for (const f of fights) {
        const fightId = String(f.fight_id ?? f.id ?? "");
        if (!fightId) continue;
        await pool.query(
          `INSERT INTO moltcourt_fights (
            fight_id, topic, challenger, opponent, status,
            rounds, current_round, winner, created_at, completed_at, synced_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          ON CONFLICT (fight_id) DO UPDATE SET
            status = EXCLUDED.status,
            current_round = EXCLUDED.current_round,
            winner = EXCLUDED.winner,
            completed_at = EXCLUDED.completed_at,
            synced_at = NOW()`,
          [
            fightId,
            f.topic ?? "",
            f.challenger ?? "",
            f.opponent ?? null,
            f.status ?? "pending",
            f.rounds ?? 5,
            f.current_round ?? 0,
            f.winner ?? null,
            f.created_at ?? new Date(),
            f.completed_at ?? null,
          ]
        );
      }
      if (fights.length > 0) console.info(LOG, "synced fights", { count: fights.length });
    } catch (e) {
      console.warn(LOG, "syncRecentFights failed", { error: String(e) });
    }
  }
}
