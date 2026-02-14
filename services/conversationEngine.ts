/**
 * Reply to agents on Moltbook with their MoltScore.
 * Rules: posted within 6h, not replied in 24h, ≥1 completed task, completionRate > 0, score ≥ 600, daily cap 20.
 * Wallet fallback: request wallet from agents without one (once); parse replies for 0x addresses.
 */

import { ethers } from "ethers";
import type { ScoredAgent } from "@/lib/types";
import {
  canReplyTo,
  markReplied,
  isUnderDailyReplyCap,
  hasAskedForWallet,
  setAskedForWallet,
  updateDiscoveredAgentWallet,
} from "@/lib/cache";

const LOG = "[ConversationEngine]";

const POSTED_WITHIN_MS = 6 * 60 * 60 * 1000; // 6 hours
const REPLY_DELAY_MS_MIN = 2000;
const REPLY_DELAY_MS_MAX = 5000;

function getBaseUrl(): string {
  return (process.env.MOLTBOOK_API_BASE ?? "https://www.moltbook.com/api/v1").replace(/\/$/, "");
}

function getApiKey(): string {
  const key = process.env.MOLTBOOK_API_KEY?.trim();
  if (!key) throw new Error("MOLTBOOK_API_KEY is required");
  return key;
}

const LEADERBOARD_URL = process.env.MOLTSCORE_LEADERBOARD_URL ?? "https://moltscore.com/app";

const WALLET_REQUEST_MESSAGE = (username: string) =>
  `@${username} To calculate your MoltScore, please reply with your Base wallet address.`;

/** Regex to find 0x-prefixed hex addresses (40 hex chars = 20 bytes). */
const ETH_ADDRESS_REGEX = /0x[a-fA-F0-9]{40}\b/g;

function buildMessage(username: string, scored: ScoredAgent): string {
  const pct = Math.round(scored.completionRate * 100);
  return [
    `@${username} Your MoltScore is **${scored.score}** (${scored.tier}).`,
    `Completion: ${pct}%`,
    `Disputes: ${scored.disputes}`,
    `Slashes: ${scored.slashes}`,
    "",
    `View full leaderboard: ${LEADERBOARD_URL}`,
  ].join("\n");
}

function randomDelayMs(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Apply reply rules; returns skip reason or null if we should reply.
 */
async function getSkipReason(username: string, scored: ScoredAgent): Promise<string | null> {
  if (scored.lastPostAt == null) return "no post time";
  if (Date.now() - scored.lastPostAt > POSTED_WITHIN_MS) return "posted more than 6 hours ago";
  if (!(await canReplyTo(username))) return "replied in last 24h";
  if (scored.tasksCompleted < 1) return "no completed tasks";
  if (scored.completionRate === 0) return "completion rate 0";
  if (scored.score < 600) return "score below 600";
  if (!(await isUnderDailyReplyCap())) return "daily reply cap reached";
  return null;
}

/**
 * POST a new post on Moltbook with the score message.
 * Skips with "Skipping {username} — reason" when rules fail. Random delay 2–5s before sending.
 */
export async function replyWithScore(username: string, scored: ScoredAgent): Promise<boolean> {
  const reason = await getSkipReason(username, scored);
  if (reason != null) {
    console.info(LOG, "Skipping", username, "—", reason);
    return false;
  }

  const delayMs = randomDelayMs(REPLY_DELAY_MS_MIN, REPLY_DELAY_MS_MAX);
  await sleep(delayMs);

  const content = buildMessage(username, scored);
  const url = `${getBaseUrl()}/posts`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        submolt: "general",
        title: `MoltScore for ${username}`,
        content,
      }),
    });

    const data = (await res.json()) as { success?: boolean; error?: string };

    if (res.ok && data.success) {
      await markReplied(username);
      console.info(LOG, "replied", { username, score: scored.score });
      return true;
    }

    console.warn(LOG, "reply failed", { username, status: res.status, error: data.error });
    return false;
  } catch (e) {
    console.error(LOG, "reply error", { username, error: String(e) });
    return false;
  }
}

/**
 * If we have not previously asked this user for a wallet, post the wallet request and set askedForWallet.
 * Does not spam: only posts once per username (guarded by cache).
 */
export async function requestWalletFromAgent(username: string): Promise<boolean> {
  if (hasAskedForWallet(username)) return false;

  const content = WALLET_REQUEST_MESSAGE(username);
  const url = `${getBaseUrl()}/posts`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        submolt: "general",
        title: `Wallet request for ${username}`,
        content,
      }),
    });

    const data = (await res.json()) as { success?: boolean; error?: string };

    if (res.ok && data.success) {
      setAskedForWallet(username);
      console.info(LOG, "requested wallet", { username });
      return true;
    }

    console.warn(LOG, "wallet request failed", { username, status: res.status, error: data.error });
    return false;
  } catch (e) {
    console.error(LOG, "wallet request error", { username, error: String(e) });
    return false;
  }
}

/** Fetch replies to our posts. Assumes Moltbook API: our posts then replies per post. Returns [] if API returns HTML or unsupported. */
async function fetchRepliesToOurPosts(): Promise<{ author: string; content: string }[]> {
  const base = getBaseUrl();
  const headers = {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  };

  const postsRes = await fetch(`${base}/posts?mine=1`, { headers });
  const contentType = postsRes.headers.get("content-type") ?? "";
  const text = await postsRes.text();
  if (!contentType.includes("application/json") || !text.trim().startsWith("{")) {
    console.info(LOG, "replies API returned non-JSON (endpoint may not exist or auth required), skipping");
    return [];
  }
  let postsData: { success?: boolean; posts?: { id: string }[]; error?: string };
  try {
    postsData = JSON.parse(text) as typeof postsData;
  } catch {
    return [];
  }
  if (!postsRes.ok || !postsData.posts?.length) return [];

  const replies: { author: string; content: string }[] = [];
  for (const post of postsData.posts.slice(0, 20)) {
    const replyRes = await fetch(`${base}/posts/${post.id}/replies`, { headers });
    const replyText = await replyRes.text();
    if (!replyText.trim().startsWith("{")) continue;
    let replyData: { success?: boolean; replies?: { author?: { name?: string }; content?: string }[] };
    try {
      replyData = JSON.parse(replyText) as typeof replyData;
    } catch {
      continue;
    }
    if (!replyRes.ok || !replyData.replies) continue;
    for (const r of replyData.replies) {
      const author = typeof r.author?.name === "string" ? r.author.name.trim() : "";
      const content = typeof r.content === "string" ? r.content : "";
      if (author && content) replies.push({ author, content });
    }
  }
  return replies;
}

/**
 * Fetch replies to our posts, detect valid 0x addresses, update discovered agent wallet and clear askedForWallet.
 * Call once per loop.
 */
export async function parseWalletReplies(): Promise<void> {
  try {
    const replies = await fetchRepliesToOurPosts();
    for (const { author, content } of replies) {
      const matches = content.match(ETH_ADDRESS_REGEX);
      if (!matches?.length) continue;
      for (const raw of matches) {
        if (!ethers.isAddress(raw)) continue;
        const wallet = ethers.getAddress(raw);
        await updateDiscoveredAgentWallet(author, wallet);
        console.info(LOG, "wallet updated from reply", { username: author, wallet: wallet.slice(0, 10) + "..." });
        break;
      }
    }
  } catch (e) {
    console.warn(LOG, "parseWalletReplies failed", { error: String(e) });
  }
}
