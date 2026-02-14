/**
 * Moltbook API crawler. Uses MOLTBOOK_API_KEY and MOLTBOOK_API_BASE.
 */

import type { DiscoveredAgent } from "@/lib/types";

const LOG = "[MoltbookCrawler]";

function getBaseUrl(): string {
  return (process.env.MOLTBOOK_API_BASE ?? "https://www.moltbook.com/api/v1").replace(/\/$/, "");
}

function getApiKey(): string {
  const key = process.env.MOLTBOOK_API_KEY?.trim();
  if (!key) throw new Error("MOLTBOOK_API_KEY is required");
  return key;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const REQUEST_DELAY_MS = 2000; // 2s between profile calls to avoid 429
const RATE_LIMIT_BACKOFF_MS = 60_000; // wait 1 min on 429 then retry once

/** Parse post date from common API fields; returns ms or 0 if missing/invalid. */
function parsePostTime(post: { created_at?: string; createdAt?: string | number }): number {
  const raw = post.created_at ?? post.createdAt;
  if (raw == null) return 0;
  if (typeof raw === "number") return raw > 1e12 ? raw : raw * 1000;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? 0 : ms;
}

export interface RecentPostsResult {
  usernames: string[];
  /** author -> most recent post timestamp (ms). */
  lastPostAtByAuthor: Record<string, number>;
  /** author -> number of posts in this feed batch (activity signal). */
  postCountByAuthor: Record<string, number>;
}

/**
 * GET /feed?sort=new&limit=50 — returns unique usernames and latest post time per author.
 */
export async function fetchRecentPosts(limit = 50): Promise<RecentPostsResult> {
  const url = `${getBaseUrl()}/feed?sort=new&limit=${Math.min(limit, 50)}`;
  console.info(LOG, "fetchRecentPosts", { limit });

  const res = await fetch(url, { headers: authHeaders() });
  const data = (await res.json()) as {
    success?: boolean;
    posts?: { author?: { name?: string }; created_at?: string; createdAt?: string | number }[];
    error?: string;
  };

  if (!res.ok) {
    console.error(LOG, "fetchRecentPosts failed", { status: res.status, error: data.error });
    throw new Error(data.error ?? `Feed failed: ${res.status}`);
  }

  const usernames = new Set<string>();
  const lastPostAtByAuthor: Record<string, number> = {};
  const postCountByAuthor: Record<string, number> = {};
  for (const post of data.posts ?? []) {
    const name = post.author?.name;
    if (name && typeof name === "string") {
      const author = name.trim();
      usernames.add(author);
      postCountByAuthor[author] = (postCountByAuthor[author] ?? 0) + 1;
      const ts = parsePostTime(post);
      if (ts > 0 && (lastPostAtByAuthor[author] == null || ts > lastPostAtByAuthor[author])) {
        lastPostAtByAuthor[author] = ts;
      }
    }
  }

  console.info(LOG, "fetchRecentPosts done", { count: usernames.size });
  return { usernames: Array.from(usernames), lastPostAtByAuthor, postCountByAuthor };
}

/**
 * GET /agents/profile?name={username} — extract wallet if available.
 * On 429, backs off then retries once; then returns agent without wallet.
 */
export async function fetchProfile(username: string): Promise<DiscoveredAgent> {
  const url = `${getBaseUrl()}/agents/profile?name=${encodeURIComponent(username)}`;
  console.info(LOG, "fetchProfile", { username });

  await sleep(REQUEST_DELAY_MS);

  const doFetch = async (): Promise<Response> => fetch(url, { headers: authHeaders() });

  let res = await doFetch();

  if (res.status === 429) {
    console.warn(LOG, "rate limited (429), backing off", { backoffSec: RATE_LIMIT_BACKOFF_MS / 1000 });
    await sleep(RATE_LIMIT_BACKOFF_MS);
    res = await doFetch();
  }

  let data: { success?: boolean; agent?: { name?: string; wallet?: string }; error?: string };
  try {
    const text = await res.text();
    data = text.startsWith("{") ? (JSON.parse(text) as typeof data) : {};
  } catch {
    data = {};
  }

  if (!res.ok) {
    console.warn(LOG, "fetchProfile failed", { username, status: res.status, error: data.error });
    return { username };
  }

  const wallet = typeof data.agent?.wallet === "string" ? data.agent.wallet : undefined;
  return { username, wallet };
}

/**
 * Crawl feed, fetch profiles with rate limiting, deduplicate. Sets lastPostAt from feed when available.
 */
export async function discoverAgents(limit = 50): Promise<DiscoveredAgent[]> {
  const { usernames, lastPostAtByAuthor, postCountByAuthor } = await fetchRecentPosts(limit);
  const seen = new Set<string>();
  const agents: DiscoveredAgent[] = [];

  for (const name of usernames) {
    if (seen.has(name)) continue;
    seen.add(name);
    const lastPostAt = lastPostAtByAuthor[name];
    const postCountInFeed = postCountByAuthor[name];
    try {
      const agent = await fetchProfile(name);
      if (lastPostAt != null) agent.lastPostAt = lastPostAt;
      if (postCountInFeed != null) agent.postCountInFeed = postCountInFeed;
      agents.push(agent);
    } catch (e) {
      console.warn(LOG, "fetchProfile error", { username: name, error: String(e) });
      agents.push({ username: name, lastPostAt, postCountInFeed });
    }
  }

  console.info(LOG, "discoverAgents done", { total: agents.length, withWallet: agents.filter((a) => a.wallet).length });
  return agents;
}
