/**
 * Postgres-backed cache for MoltScore pipeline.
 * Same function interface; discovered, scored, replied stored in DB. Rest in-memory.
 */

import { pool } from "./db";
import type { DiscoveredAgent, ScoredAgent } from "./types";

const LOG = "[Cache]";
const REPLY_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
const REPLY_CAP_MAX = 20;

/** Per-wallet cumulative counts + first-seen block timestamp (for ageDays). In-memory. */
export interface WalletMetricsRow {
  tasksCompleted: number;
  tasksFailed: number;
  disputes: number;
  slashes: number;
  firstBlockTimestamp: number;
}

export type LastProcessedBlockStore = Record<string, number>;

export interface ReplyCapState {
  count: number;
  windowStartMs: number;
}

export interface LeaderboardCache {
  discovered: DiscoveredAgent[];
  scored: ScoredAgent[];
  repliedAt: Record<string, number>;
  askedForWallet: Record<string, boolean>;
  lastUpdated: number;
  replyCap: ReplyCapState;
  lastProcessedBlockByContract: LastProcessedBlockStore;
  walletMetrics: Record<string, WalletMetricsRow>;
}

const memory: Pick<
  LeaderboardCache,
  "askedForWallet" | "lastProcessedBlockByContract" | "walletMetrics"
> = {
  askedForWallet: {},
  lastProcessedBlockByContract: {},
  walletMetrics: {},
};

function rowToDiscovered(r: { username: string; wallet: string | null; last_post_at: Date | null }): DiscoveredAgent {
  return {
    username: r.username,
    wallet: r.wallet ?? undefined,
    lastPostAt: r.last_post_at ? new Date(r.last_post_at).getTime() : undefined,
  };
}

function rowToScored(r: {
  username: string;
  wallet: string | null;
  score: number | null;
  tier: string | null;
  completion_rate: number | null;
  tasks_completed: number | null;
  tasks_failed: number | null;
  disputes: number | null;
  slashes: number | null;
  age_days: number | null;
  updated_at: Date | null;
  last_post_at?: Date | null;
}): ScoredAgent {
  return {
    wallet: r.wallet ?? "",
    tasksCompleted: r.tasks_completed ?? 0,
    tasksFailed: r.tasks_failed ?? 0,
    disputes: r.disputes ?? 0,
    slashes: r.slashes ?? 0,
    ageDays: r.age_days ?? 0,
    score: r.score ?? 0,
    tier: r.tier ?? "",
    completionRate: r.completion_rate ?? 0,
    username: r.username,
    lastPostAt: r.last_post_at ? new Date(r.last_post_at).getTime() : undefined,
  };
}

export async function getCache(): Promise<LeaderboardCache> {
  let discovered: DiscoveredAgent[] = [];
  let scored: ScoredAgent[] = [];
  let lastUpdated = 0;

  try {
    const [discRes, scoredRes, maxRes] = await Promise.all([
      pool.query("SELECT username, wallet, last_seen_at, last_post_at FROM discovered_agents"),
      pool.query(
        "SELECT username, wallet, score, tier, completion_rate, tasks_completed, tasks_failed, disputes, slashes, age_days, updated_at FROM scored_agents"
      ),
      pool.query("SELECT COALESCE(EXTRACT(EPOCH FROM MAX(updated_at)) * 1000, 0)::bigint AS ms FROM scored_agents"),
    ]);
    discovered = (discRes.rows as { username: string; wallet: string | null; last_post_at: Date | null }[]).map(
      rowToDiscovered
    );
    scored = (scoredRes.rows as Record<string, unknown>[]).map((r) =>
      rowToScored({ ...r, last_post_at: null } as Parameters<typeof rowToScored>[0])
    );
    lastUpdated = Number(maxRes.rows[0]?.ms ?? 0);
  } catch (e) {
    console.warn(LOG, "getCache query error", { error: String(e) });
  }

  const replyCount = await getReplyCountInLast24h();
  return {
    discovered,
    scored,
    repliedAt: {},
    askedForWallet: memory.askedForWallet,
    lastUpdated,
    replyCap: { count: replyCount, windowStartMs: 0 },
    lastProcessedBlockByContract: memory.lastProcessedBlockByContract,
    walletMetrics: memory.walletMetrics,
  };
}

export async function setDiscovered(agents: DiscoveredAgent[]): Promise<void> {
  if (agents.length === 0) return;
  const client = await pool.connect();
  try {
    for (const a of agents) {
      await client.query(
        `INSERT INTO discovered_agents (username, wallet, last_seen_at, last_post_at)
         VALUES ($1, $2, NOW(), $3::timestamptz)
         ON CONFLICT (username) DO UPDATE SET wallet = EXCLUDED.wallet, last_seen_at = NOW(), last_post_at = EXCLUDED.last_post_at`,
        [a.username, a.wallet ?? null, a.lastPostAt != null ? new Date(a.lastPostAt) : null]
      );
    }
  } catch (e) {
    console.warn(LOG, "setDiscovered error", { error: String(e) });
  } finally {
    client.release();
  }
}

export async function setScored(agents: ScoredAgent[]): Promise<void> {
  if (agents.length === 0) return;
  const client = await pool.connect();
  try {
    for (const a of agents) {
      await client.query(
        `INSERT INTO scored_agents (username, wallet, score, tier, completion_rate, tasks_completed, tasks_failed, disputes, slashes, age_days, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
         ON CONFLICT (username) DO UPDATE SET
           wallet = EXCLUDED.wallet, score = EXCLUDED.score, tier = EXCLUDED.tier,
           completion_rate = EXCLUDED.completion_rate, tasks_completed = EXCLUDED.tasks_completed,
           tasks_failed = EXCLUDED.tasks_failed, disputes = EXCLUDED.disputes, slashes = EXCLUDED.slashes,
           age_days = EXCLUDED.age_days, updated_at = NOW()`,
        [
          a.username ?? "",
          a.wallet,
          a.score,
          a.tier,
          a.completionRate,
          a.tasksCompleted,
          a.tasksFailed,
          a.disputes,
          a.slashes,
          a.ageDays,
        ]
      );
    }
  } catch (e) {
    console.warn(LOG, "setScored error", { error: String(e) });
  } finally {
    client.release();
  }
}

export async function getTopScored(limit: number): Promise<ScoredAgent[]> {
  try {
    const res = await pool.query(
      `SELECT username, wallet, score, tier, completion_rate, tasks_completed, tasks_failed, disputes, slashes, age_days, updated_at
       FROM scored_agents ORDER BY score DESC NULLS LAST LIMIT $1`,
      [limit]
    );
    return (res.rows as Record<string, unknown>[]).map((r) =>
      rowToScored({ ...r, last_post_at: null } as Parameters<typeof rowToScored>[0])
    );
  } catch (e) {
    console.warn(LOG, "getTopScored error", { error: String(e) });
    return [];
  }
}

/** Last time scored_agents was updated (ms). For API lastUpdated. */
export async function getLastUpdated(): Promise<number> {
  try {
    const res = await pool.query(
      `SELECT COALESCE(EXTRACT(EPOCH FROM MAX(updated_at)) * 1000, 0)::bigint AS ms FROM scored_agents`
    );
    return Number(res.rows[0]?.ms ?? 0);
  } catch (e) {
    console.warn(LOG, "getLastUpdated error", { error: String(e) });
    return 0;
  }
}

export async function markReplied(username: string): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO replied_agents (username, replied_at) VALUES ($1, NOW())
       ON CONFLICT (username) DO UPDATE SET replied_at = NOW()`,
      [username]
    );
  } catch (e) {
    console.warn(LOG, "markReplied error", { username, error: String(e) });
  }
}

export async function getReplyCountInLast24h(): Promise<number> {
  try {
    const res = await pool.query(
      `SELECT COUNT(*)::int AS c FROM replied_agents WHERE replied_at > NOW() - INTERVAL '24 hours'`
    );
    return Number(res.rows[0]?.c ?? 0);
  } catch (e) {
    console.warn(LOG, "getReplyCountInLast24h error", { error: String(e) });
    return 0;
  }
}

export async function isUnderDailyReplyCap(): Promise<boolean> {
  return (await getReplyCountInLast24h()) < REPLY_CAP_MAX;
}

export async function canReplyTo(username: string): Promise<boolean> {
  try {
    const res = await pool.query(
      `SELECT replied_at FROM replied_agents WHERE username = $1`,
      [username]
    );
    const row = res.rows[0] as { replied_at: Date } | undefined;
    if (!row) return true;
    const at = new Date(row.replied_at).getTime();
    return Date.now() - at >= REPLY_COOLDOWN_MS;
  } catch (e) {
    console.warn(LOG, "canReplyTo error", { username, error: String(e) });
    return true;
  }
}

export async function getRepliedCooldownRemainingMs(username: string): Promise<number> {
  try {
    const res = await pool.query(`SELECT replied_at FROM replied_agents WHERE username = $1`, [username]);
    const row = res.rows[0] as { replied_at: Date } | undefined;
    if (!row) return 0;
    const at = new Date(row.replied_at).getTime();
    const elapsed = Date.now() - at;
    return Math.max(0, REPLY_COOLDOWN_MS - elapsed);
  } catch (e) {
    console.warn(LOG, "getRepliedCooldownRemainingMs error", { username, error: String(e) });
    return 0;
  }
}

export function hasAskedForWallet(username: string): boolean {
  return memory.askedForWallet[username] === true;
}

export function setAskedForWallet(username: string): void {
  memory.askedForWallet[username] = true;
}

export function clearAskedForWallet(username: string): void {
  delete memory.askedForWallet[username];
}

export async function updateDiscoveredAgentWallet(username: string, wallet: string): Promise<void> {
  try {
    await pool.query(`UPDATE discovered_agents SET wallet = $1 WHERE username = $2`, [wallet, username]);
    clearAskedForWallet(username);
  } catch (e) {
    console.warn(LOG, "updateDiscoveredAgentWallet error", { username, error: String(e) });
  }
}

export function getLastProcessedBlock(contractKey: string): number | undefined {
  return memory.lastProcessedBlockByContract[contractKey];
}

export function setLastProcessedBlock(contractKey: string, blockNumber: number): void {
  memory.lastProcessedBlockByContract[contractKey] = blockNumber;
}

export function getWalletMetricsRow(wallet: string): WalletMetricsRow | undefined {
  return memory.walletMetrics[wallet];
}

export function mergeWalletMetrics(
  wallet: string,
  update: Partial<WalletMetricsRow> & { firstBlockTimestamp?: number }
): void {
  const cur = memory.walletMetrics[wallet];
  const base: WalletMetricsRow = cur
    ? { ...cur }
    : { tasksCompleted: 0, tasksFailed: 0, disputes: 0, slashes: 0, firstBlockTimestamp: 0 };
  if (update.tasksCompleted !== undefined) base.tasksCompleted += update.tasksCompleted;
  if (update.tasksFailed !== undefined) base.tasksFailed += update.tasksFailed;
  if (update.disputes !== undefined) base.disputes += update.disputes;
  if (update.slashes !== undefined) base.slashes += update.slashes;
  if (update.firstBlockTimestamp !== undefined && update.firstBlockTimestamp > 0) {
    if (base.firstBlockTimestamp === 0 || update.firstBlockTimestamp < base.firstBlockTimestamp) {
      base.firstBlockTimestamp = update.firstBlockTimestamp;
    }
  }
  memory.walletMetrics[wallet] = base;
}
