/**
 * Agent discovery via Identity Registry.
 * Replaces Moltbook-based discovery with onchain event scanning.
 *
 * Scans `Registered(uint256 indexed agentId, string agentURI, address indexed owner)`
 * events from the Identity Registry contract, stores discovered agents in mandate_agents.
 *
 * Uses incremental block scanning persisted to `scan_state` table.
 */

import { ethers } from "ethers";
import {
  getProvider,
  getIdentityContract,
  IDENTITY_ADDRESS,
  IDENTITY_ABI,
  type MandateAgent,
} from "./mandateContracts";
import { pool } from "@/lib/db";

/** Read the last processed block from scan_state table. */
async function getLastProcessedBlock(key: string): Promise<number | null> {
  try {
    const result = await pool.query(
      "SELECT last_block FROM scan_state WHERE scan_key = $1",
      [key]
    );
    return result.rows.length > 0 ? (result.rows[0].last_block as number) : null;
  } catch {
    return null;
  }
}

/** Write the last processed block to scan_state table. */
async function setLastProcessedBlock(key: string, block: number): Promise<void> {
  await pool.query(
    `INSERT INTO scan_state (scan_key, last_block, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (scan_key) DO UPDATE SET last_block = $2, updated_at = NOW()`,
    [key, block]
  );
}

const LOG = "[MandateDiscovery]";

/** Contract key for scan_state persistence. */
const SCAN_KEY = `identity:${IDENTITY_ADDRESS}`;

/** Block chunk size for getLogs. Public RPCs limit to ~2000-5000 blocks. */
const BLOCK_CHUNK = 2000;

/** Delay between RPC chunk requests (ms) to avoid rate limits. */
const CHUNK_DELAY_MS = 200;

/** Max chunks per run to avoid Vercel function timeout (roughly 2000 * 500 = 1M blocks). */
const MAX_CHUNKS_PER_RUN = 500;

/** Timeout for a single getLogs call (ms). Public RPCs hang instead of erroring. */
const RPC_CALL_TIMEOUT_MS = 10_000;

/** Progress log interval (log every N chunks even if no events found). */
const PROGRESS_LOG_INTERVAL = 50;

/** Default start block. Override with MANDATE_START_BLOCK env var. */
function getStartBlock(): number {
  const raw = process.env.MANDATE_START_BLOCK?.trim();
  if (raw) {
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 0) return n;
  }
  return 0;
}

/**
 * Parse a Registered event log into a MandateAgent (without wallet resolution).
 * Owner address is used as the initial wallet.
 */
function parseRegisteredEvent(
  log: ethers.Log,
  iface: ethers.Interface
): MandateAgent | null {
  try {
    const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
    if (!parsed || parsed.name !== "Registered") return null;

    const agentId = Number(parsed.args.agentId);
    const agentURI = parsed.args.agentURI ?? "";
    const owner = parsed.args.owner;

    return {
      agentId,
      owner,
      wallet: owner, // Default: owner is wallet. Updated later via getAgentWallet.
      agentURI,
    };
  } catch (e) {
    console.warn(LOG, "Failed to parse Registered event:", String(e).slice(0, 100));
    return null;
  }
}

/**
 * Upsert discovered agents into the mandate_agents table.
 * Only writes identity fields (agent_id, owner_address, wallet_address, agent_uri).
 * Does NOT overwrite escrow/reputation/scoring data.
 */
async function upsertAgents(agents: MandateAgent[]): Promise<number> {
  if (agents.length === 0) return 0;
  const client = await pool.connect();
  let inserted = 0;
  try {
    for (const a of agents) {
      await client.query(
        `INSERT INTO mandate_agents (agent_id, owner_address, wallet_address, agent_uri, discovered_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (agent_id) DO UPDATE SET
           owner_address = EXCLUDED.owner_address,
           wallet_address = COALESCE(mandate_agents.wallet_address, EXCLUDED.wallet_address),
           agent_uri = COALESCE(EXCLUDED.agent_uri, mandate_agents.agent_uri),
           discovered_at = COALESCE(mandate_agents.discovered_at, EXCLUDED.discovered_at)`,
        [a.agentId, a.owner, a.wallet, a.agentURI]
      );
      inserted++;
    }
  } catch (e) {
    console.error(LOG, "upsertAgents failed:", String(e).slice(0, 200));
  } finally {
    client.release();
  }
  return inserted;
}

/**
 * Resolve wallets for agents where owner != actual wallet.
 * Calls getAgentWallet(agentId) for a batch of agents and updates the DB.
 * Rate-limited to avoid RPC throttling.
 */
export async function resolveWallets(agentIds: number[], batchSize = 10): Promise<number> {
  const contract = getIdentityContract();
  if (!contract) return 0;

  let updated = 0;
  for (let i = 0; i < agentIds.length; i += batchSize) {
    const batch = agentIds.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((id) => contract.getAgentWallet(id) as Promise<string>)
    );

    for (let j = 0; j < batch.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled" && result.value && result.value !== ethers.ZeroAddress) {
        try {
          await pool.query(
            `UPDATE mandate_agents SET wallet_address = $1 WHERE agent_id = $2`,
            [result.value, batch[j]]
          );
          updated++;
        } catch (e) {
          console.warn(LOG, `resolveWallet DB update failed for agent ${batch[j]}:`, String(e).slice(0, 100));
        }
      }
    }

    if (i + batchSize < agentIds.length) {
      await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
    }
  }

  console.info(LOG, `resolveWallets: updated ${updated}/${agentIds.length}`);
  return updated;
}

/**
 * Main discovery function. Scans Registered events incrementally.
 *
 * Returns { newAgents, totalScanned, fromBlock, toBlock }.
 */
export async function discoverAgents(): Promise<{
  newAgents: number;
  totalScanned: number;
  fromBlock: number;
  toBlock: number;
}> {
  const provider = getProvider();
  if (!provider) {
    console.warn(LOG, "No provider available — skipping discovery");
    return { newAgents: 0, totalScanned: 0, fromBlock: 0, toBlock: 0 };
  }

  const latestBlock = await provider.getBlockNumber();
  const lastProcessed = await getLastProcessedBlock(SCAN_KEY);
  const fromBlock = lastProcessed != null ? lastProcessed + 1 : getStartBlock();

  if (fromBlock > latestBlock) {
    console.info(LOG, "Already up to date", { lastProcessed, latestBlock });
    return { newAgents: 0, totalScanned: 0, fromBlock, toBlock: latestBlock };
  }

  // Build interface for event parsing
  const iface = new ethers.Interface(IDENTITY_ABI);
  const registeredTopic = iface.getEvent("Registered")?.topicHash;
  if (!registeredTopic) {
    console.error(LOG, "Could not find Registered event topic hash");
    return { newAgents: 0, totalScanned: 0, fromBlock, toBlock: latestBlock };
  }

  console.info(LOG, `Scanning blocks ${fromBlock} → ${latestBlock} (${latestBlock - fromBlock + 1} blocks)`);

  let totalScanned = 0;
  let newAgents = 0;
  let chunksProcessed = 0;
  let currentFrom = fromBlock;

  let retries = 0;
  const MAX_RETRIES_PER_CHUNK = 2;

  while (currentFrom <= latestBlock && chunksProcessed < MAX_CHUNKS_PER_RUN) {
    const currentTo = Math.min(currentFrom + BLOCK_CHUNK - 1, latestBlock);

    try {
      // Timeout wrapper — public RPCs sometimes hang instead of erroring
      const logsPromise = provider.getLogs({
        address: IDENTITY_ADDRESS,
        topics: [registeredTopic],
        fromBlock: currentFrom,
        toBlock: currentTo,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("RPC_TIMEOUT")), RPC_CALL_TIMEOUT_MS)
      );
      const logs = await Promise.race([logsPromise, timeoutPromise]);
      retries = 0; // Reset on success

      if (logs.length > 0) {
        const agents: MandateAgent[] = [];
        for (const log of logs) {
          const agent = parseRegisteredEvent(log, iface);
          if (agent) agents.push(agent);
        }

        if (agents.length > 0) {
          const inserted = await upsertAgents(agents);
          newAgents += inserted;
          totalScanned += logs.length;
          console.info(LOG, `Chunk ${currentFrom}-${currentTo}: ${logs.length} events, ${inserted} agents upserted (total: ${newAgents})`);
        }
      }

      // Persist progress after each successful chunk
      await setLastProcessedBlock(SCAN_KEY, currentTo);
    } catch (e) {
      const msg = String(e);
      if (msg.includes("RPC_TIMEOUT") || msg.includes("no backend") || msg.includes("rate limit") || msg.includes("missing revert data")) {
        retries++;
        if (retries <= MAX_RETRIES_PER_CHUNK) {
          console.warn(LOG, `RPC issue at block ${currentFrom} (retry ${retries}/${MAX_RETRIES_PER_CHUNK}), pausing...`);
          await new Promise((r) => setTimeout(r, 2000 * retries));
          continue; // Retry same chunk
        }
        console.warn(LOG, `Skipping chunk ${currentFrom}-${currentTo} after ${retries} retries`);
        retries = 0;
      } else {
        console.error(LOG, `Error scanning ${currentFrom}-${currentTo}:`, msg.slice(0, 200));
      }
    }

    currentFrom = currentTo + 1;
    chunksProcessed++;

    // Progress log every N chunks
    if (chunksProcessed % PROGRESS_LOG_INTERVAL === 0) {
      const pct = (((currentFrom - fromBlock) / (latestBlock - fromBlock + 1)) * 100).toFixed(1);
      console.info(LOG, `Progress: ${chunksProcessed} chunks, block ${currentFrom} (${pct}%), ${newAgents} agents found`);
    }

    if (chunksProcessed < MAX_CHUNKS_PER_RUN && currentFrom <= latestBlock) {
      await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
    }
  }

  const finalTo = Math.min(fromBlock + chunksProcessed * BLOCK_CHUNK - 1, latestBlock);
  console.info(LOG, `Discovery complete: ${newAgents} new agents from ${totalScanned} events (blocks ${fromBlock}→${finalTo})`);

  return { newAgents, totalScanned, fromBlock, toBlock: finalTo };
}

/**
 * Get total number of discovered agents in the mandate_agents table.
 */
export async function getDiscoveredAgentCount(): Promise<number> {
  try {
    const res = await pool.query(`SELECT COUNT(*)::int AS c FROM mandate_agents`);
    return Number(res.rows[0]?.c ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Get all agent IDs from the mandate_agents table.
 */
export async function getAllAgentIds(): Promise<number[]> {
  try {
    const res = await pool.query(`SELECT agent_id FROM mandate_agents ORDER BY agent_id`);
    return res.rows.map((r: { agent_id: number }) => r.agent_id);
  } catch {
    return [];
  }
}

/**
 * Get agents that need wallet resolution (where wallet = owner, meaning not yet resolved).
 */
export async function getAgentsNeedingWalletResolution(limit = 100): Promise<number[]> {
  try {
    const res = await pool.query(
      `SELECT agent_id FROM mandate_agents
       WHERE wallet_address = owner_address
       ORDER BY agent_id
       LIMIT $1`,
      [limit]
    );
    return res.rows.map((r: { agent_id: number }) => r.agent_id);
  } catch {
    return [];
  }
}
