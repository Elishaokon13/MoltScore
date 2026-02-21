/**
 * Live read-only client for api.moltlaunch.com.
 * Use at request time so reputation, market cap, volume etc. are up to date.
 * List is cached briefly to avoid hammering the API.
 */

const API_BASE = "https://api.moltlaunch.com/api/agents";
const LIST_CACHE_TTL_MS = 60_000; // 1 minute
const AGENT_CACHE_TTL_MS = 60_000; // 1 minute per agent

export interface MoltAgent {
  id: string;
  agentIdBigInt: string;
  owner: string;
  agentURI: string;
  agentWallet: string;
  name: string;
  description: string;
  skills: string[];
  endpoint: string;
  priceWei: string;
  flaunchToken?: string;
  reputation: { count: number; summaryValue: number };
  marketCapUSD?: number;
  volume24hUSD?: number;
  priceChange24h?: number;
  liquidityUSD?: number;
  holders?: number;
  image?: string;
  symbol?: string;
  flaunchUrl?: string;
  twitter?: string;
  xVerified?: boolean;
  hasProfile?: boolean;
  gigCount?: number;
  completedTasks?: number;
  activeTasks?: number;
  lastActiveAt?: number;
  totalBurnedETH?: number;
  totalBurnedUSD?: number;
  totalBurnedTokens?: number;
}

interface ListResponse {
  agents: MoltAgent[];
  total: number;
  page: number;
  pages: number;
}

interface SingleResponse {
  agent: MoltAgent;
}

let listCache: { at: number; agents: MoltAgent[] } | null = null;
const agentCache = new Map<number, { at: number; agent: MoltAgent }>();
const AGENT_CACHE_MAX = 200;

function pruneAgentCache() {
  if (agentCache.size <= AGENT_CACHE_MAX) return;
  const now = Date.now();
  for (const [id, entry] of agentCache.entries()) {
    if (now - entry.at >= AGENT_CACHE_TTL_MS) agentCache.delete(id);
  }
}

async function fetchListPage(page: number): Promise<ListResponse> {
  const res = await fetch(`${API_BASE}?page=${page}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`MoltLaunch list ${res.status}`);
  return (await res.json()) as ListResponse;
}

/**
 * Fetch all agents from MoltLaunch (all pages). Cached for LIST_CACHE_TTL_MS.
 */
export async function fetchAllAgents(): Promise<MoltAgent[]> {
  const now = Date.now();
  if (listCache && now - listCache.at < LIST_CACHE_TTL_MS) {
    return listCache.agents;
  }
  const agents: MoltAgent[] = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const data = await fetchListPage(page);
    totalPages = data.pages;
    agents.push(...data.agents);
    page++;
  }
  listCache = { at: now, agents };
  return agents;
}

/**
 * Fetch a single agent by numeric id (agentIdBigInt). Cached for AGENT_CACHE_TTL_MS per id.
 * Tries numeric id first, then hex (e.g. 0x644) in case the API expects hex.
 */
export async function fetchAgentById(agentId: number): Promise<MoltAgent | null> {
  const now = Date.now();
  const cached = agentCache.get(agentId);
  if (cached && now - cached.at < AGENT_CACHE_TTL_MS) {
    return cached.agent;
  }
  const tryFetch = async (id: string): Promise<MoltAgent | null> => {
    const res = await fetch(`${API_BASE}/${id}`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as SingleResponse;
    return data.agent ?? null;
  };
  try {
    let agent = await tryFetch(String(agentId));
    if (!agent && agentId > 0) {
      const hexId = "0x" + agentId.toString(16);
      agent = await tryFetch(hexId);
    }
    if (agent) {
      agentCache.set(agentId, { at: now, agent });
      pruneAgentCache();
    }
    return agent;
  } catch {
    return null;
  }
}
