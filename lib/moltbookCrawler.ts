/**
 * Moltbook Crawler — autonomous agent discovery and conversation engine.
 * Uses MOLTBOOK_API_KEY from environment. No hardcoded secrets.
 */

const BASE_URL = "https://www.moltbook.com/api/v1";
const LOG_PREFIX = "[MoltbookCrawler]";

/* --- Logger --- */
function log(level: "info" | "warn" | "error", message: string, meta?: Record<string, unknown>) {
  const line = meta ? `${LOG_PREFIX} ${message} ${JSON.stringify(meta)}` : `${LOG_PREFIX} ${message}`;
  switch (level) {
    case "info":
      console.info(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "error":
      console.error(line);
      break;
  }
}

function getApiKey(): string {
  const key = process.env.MOLTBOOK_API_KEY;
  if (!key || key.trim() === "") {
    log("error", "MOLTBOOK_API_KEY is not set");
    throw new Error("MOLTBOOK_API_KEY is required. Set it in your environment.");
  }
  return key.trim();
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
  };
}

/* --- API response types (minimal) --- */
interface FeedPost {
  id: string;
  author?: { name?: string; id?: string };
  title?: string;
  content?: string;
  created_at?: string;
}

interface FeedResponse {
  success?: boolean;
  posts?: FeedPost[];
  error?: string;
  hint?: string;
}

interface AgentProfileResponse {
  success?: boolean;
  agent?: {
    name?: string;
    description?: string;
    karma?: number;
    follower_count?: number;
    following_count?: number;
    created_at?: string;
    last_active?: string;
    is_claimed?: boolean;
    is_active?: boolean;
    wallet?: string;
    metadata?: Record<string, unknown>;
  };
  recentPosts?: { id: string; title?: string }[];
  error?: string;
  hint?: string;
}

function firstPostId(recentPosts: unknown): string | null {
  if (!Array.isArray(recentPosts) || recentPosts.length === 0) return null;
  const first = recentPosts[0];
  return first && typeof first === "object" && typeof (first as { id?: string }).id === "string"
    ? (first as { id: string }).id
    : null;
}

export interface AgentProfile {
  username: string;
  wallet: string | null;
  followers: number;
  post_count: number;
  join_date: string | null;
  /** ID of most recent post (for reply targeting) */
  recent_post_id: string | null;
}

/* --- In-memory agent cache --- */
interface CachedAgent {
  username: string;
  profile: AgentProfile | null;
  lastSeenAt: number;
}

const agentCache = new Map<string, CachedAgent>();

function getCachedAgent(username: string): CachedAgent | undefined {
  return agentCache.get(username);
}

function setCachedAgent(username: string, profile: AgentProfile | null): void {
  agentCache.set(username, {
    username,
    profile,
    lastSeenAt: Date.now(),
  });
}

/* --- Rate limit state (comments: 20s, posts: 30min) --- */
let lastCommentAt = 0;
const COMMENT_COOLDOWN_MS = 21_000; // 20 sec + buffer
let lastPostAt = 0;
const POST_COOLDOWN_MS = 31 * 60 * 1000; // 30 min + buffer

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureCommentCooldown(): Promise<void> {
  const elapsed = Date.now() - lastCommentAt;
  if (elapsed < COMMENT_COOLDOWN_MS) {
    const wait = COMMENT_COOLDOWN_MS - elapsed;
    log("info", `Comment cooldown: waiting ${Math.round(wait / 1000)}s`);
    await sleep(wait);
  }
}

async function ensurePostCooldown(): Promise<void> {
  const elapsed = Date.now() - lastPostAt;
  if (elapsed < POST_COOLDOWN_MS) {
    const wait = POST_COOLDOWN_MS - elapsed;
    log("info", `Post cooldown: waiting ${Math.round(wait / 1000)}s`);
    await sleep(wait);
  }
}

/* --- 1) fetchRecentPosts --- */
/**
 * Fetches recent feed and returns unique agent usernames (authors).
 */
export async function fetchRecentPosts(limit = 50): Promise<string[]> {
  getApiKey(); // validate key
  const url = `${BASE_URL}/feed?sort=new&limit=${Math.min(limit, 50)}`;
  log("info", "Fetching recent posts", { url });

  const res = await fetch(url, { headers: authHeaders() });
  const data = (await res.json()) as FeedResponse;

  if (!res.ok) {
    log("error", "Feed request failed", { status: res.status, error: data.error, hint: data.hint });
    throw new Error(data.error ?? `Feed failed: ${res.status}`);
  }

  if (!data.success || !Array.isArray(data.posts)) {
    log("warn", "Unexpected feed shape", { success: data.success });
    return [];
  }

  const usernames = new Set<string>();
  for (const post of data.posts) {
    const name = post.author?.name;
    if (name && typeof name === "string" && name.trim()) {
      usernames.add(name.trim());
    }
  }

  log("info", "Extracted unique usernames", { count: usernames.size });
  return Array.from(usernames);
}

/* --- 2) fetchAgentProfile --- */
/**
 * Fetches public profile for an agent. Uses GET /api/v1/agents/profile?name=USERNAME.
 */
export async function fetchAgentProfile(username: string): Promise<AgentProfile> {
  getApiKey();
  const encoded = encodeURIComponent(username);
  const url = `${BASE_URL}/agents/profile?name=${encoded}`;
  log("info", "Fetching agent profile", { username });

  const res = await fetch(url, { headers: authHeaders() });
  const data = (await res.json()) as AgentProfileResponse;

  if (!res.ok) {
    log("warn", "Profile request failed", { username, status: res.status, error: data.error });
    return {
      username,
      wallet: null,
      followers: 0,
      post_count: 0,
      join_date: null,
      recent_post_id: null,
    };
  }

  const agent = data.agent ?? {};
  const recentPosts = data.recentPosts ?? [];
  const profile: AgentProfile = {
    username,
    wallet: typeof agent.wallet === "string" ? agent.wallet : null,
    followers: typeof agent.follower_count === "number" ? agent.follower_count : 0,
    post_count: Array.isArray(recentPosts) ? recentPosts.length : 0,
    join_date: typeof agent.created_at === "string" ? agent.created_at : null,
    recent_post_id: firstPostId(recentPosts),
  };

  log("info", "Profile fetched", { username, followers: profile.followers, post_count: profile.post_count });
  return profile;
}

/* --- 3) discoverAgents --- */
/**
 * Crawls feed, deduplicates agents, and stores them in the in-memory cache.
 * Returns list of discovered usernames.
 */
export async function discoverAgents(limit = 50): Promise<string[]> {
  getApiKey();
  log("info", "Discovering agents from feed", { limit });

  const usernames = await fetchRecentPosts(limit);
  const deduped = Array.from(new Set(usernames));

  for (const name of deduped) {
    const existing = getCachedAgent(name);
    if (!existing) {
      setCachedAgent(name, null);
    }
  }

  log("info", "Agents discovered and cached", { count: deduped.length });
  return deduped;
}

/**
 * Get cached profile; fetches from API if not in cache or stale.
 */
export async function getOrFetchProfile(username: string): Promise<AgentProfile> {
  const cached = getCachedAgent(username);
  const profile = await fetchAgentProfile(username);
  setCachedAgent(username, profile);
  return profile;
}

/* --- 4) sendMessage --- */
/**
 * Sends a message that mentions the user.
 * - If replyTo (post id) is provided: posts a comment on that post with "@username message".
 * - Otherwise: creates a new post in "general" that mentions @username and the message.
 */
export async function sendMessage(
  username: string,
  message: string,
  replyTo?: string
): Promise<{ success: boolean; postId?: string; commentId?: string; error?: string }> {
  getApiKey();
  const mention = `@${username}`;
  const content = message.trim().startsWith(mention) ? message.trim() : `${mention} ${message.trim()}`;

  if (replyTo) {
    await ensureCommentCooldown();
    const url = `${BASE_URL}/posts/${replyTo}/comments`;
    log("info", "Sending comment (mention)", { username, replyTo });

    const res = await fetch(url, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ content }),
    });
    const data = (await res.json()) as { success?: boolean; comment?: { id?: string }; error?: string };

    if (res.ok && data.success) {
      lastCommentAt = Date.now();
      log("info", "Comment sent", { username, commentId: data.comment?.id });
      return { success: true, commentId: data.comment?.id };
    }

    log("warn", "Comment failed", { username, status: res.status, error: data.error });
    return { success: false, error: data.error ?? `HTTP ${res.status}` };
  }

  await ensurePostCooldown();
  const url = `${BASE_URL}/posts`;
  log("info", "Sending post (mention)", { username });

  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      submolt: "general",
      title: `Question for ${username}`,
      content,
    }),
  });
  const data = (await res.json()) as { success?: boolean; post?: { id?: string }; error?: string };

  if (res.ok && data.success) {
    lastPostAt = Date.now();
    log("info", "Post sent", { username, postId: data.post?.id });
    return { success: true, postId: data.post?.id };
  }

  log("warn", "Post failed", { username, status: res.status, error: data.error });
  return { success: false, error: data.error ?? `HTTP ${res.status}` };
}

/* --- 5) autoConversation --- */
const CONVERSATION_QUESTIONS = [
  "What's your typical dispute rate in tasks you run, and how do you handle them?",
  "How do you measure and report task success (completion rate, SLA, etc.)?",
  "What's your main specialization (e.g. research, coding, ops), and how do you prefer to be used?",
];

const DEFAULT_TOP_N = 5;
const DELAY_BETWEEN_MESSAGES_MS = 25_000; // 25s between outreaches to stay under 20s comment cooldown

export interface AutoConversationOptions {
  topN?: number;
  delayMs?: number;
  dryRun?: boolean;
}

/**
 * Picks top active agents from discovered cache, then sends them a short
 * question about dispute rate, task success, or specialization.
 * Rate-limited to avoid spam (comment cooldown respected).
 */
export async function autoConversation(options: AutoConversationOptions = {}): Promise<
  { username: string; question: string; success: boolean; error?: string }[]
> {
  const { topN = DEFAULT_TOP_N, delayMs = DELAY_BETWEEN_MESSAGES_MS, dryRun = false } = options;
  getApiKey();

  log("info", "Starting autoConversation", { topN, delayMs, dryRun });

  const usernames = await discoverAgents(50);
  if (usernames.length === 0) {
    log("warn", "No agents discovered");
    return [];
  }

  const profiles: { username: string; profile: AgentProfile }[] = [];
  for (const name of usernames) {
    const profile = await getOrFetchProfile(name);
    profiles.push({ username: name, profile });
  }

  const byActivity = profiles
    .filter((p) => p.profile.followers >= 0)
    .sort((a, b) => {
      const scoreA = a.profile.followers + a.profile.post_count * 2;
      const scoreB = b.profile.followers + b.profile.post_count * 2;
      return scoreB - scoreA;
    })
    .slice(0, topN);

  const results: { username: string; question: string; success: boolean; error?: string }[] = [];
  const question = CONVERSATION_QUESTIONS[0];

  for (let i = 0; i < byActivity.length; i++) {
    const { username, profile } = byActivity[i];
    if (i > 0) {
      log("info", "Rate limit: waiting before next message", { delayMs });
      await sleep(delayMs);
    }

    if (dryRun) {
      log("info", "Dry run: would send", { username, question: question.slice(0, 50) });
      results.push({ username, question, success: true });
      continue;
    }

    const recentPostId = profile.recent_post_id ?? undefined;
    const result = await sendMessage(username, question, recentPostId);
    results.push({
      username,
      question,
      success: result.success,
      error: result.error,
    });
  }

  log("info", "autoConversation finished", { total: results.length, ok: results.filter((r) => r.success).length });
  return results;
}
