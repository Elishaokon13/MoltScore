/**
 * Onchain metrics for agents via Base RPC.
 * Uses incremental block scanning: from lastProcessedBlock (or MOLT_START_BLOCK) to latest.
 */

import { ethers } from "ethers";
import type { AgentMetrics } from "@/lib/types";
import {
  getLastProcessedBlock,
  setLastProcessedBlock,
  getWalletMetricsRow,
  mergeWalletMetrics,
} from "@/lib/cache";

const LOG = "[AgentMetrics]";

const MOLT_TASKS_ADDRESS = process.env.MOLT_TASKS_ADDRESS ?? "0x0000000000000000000000000000000000000001";
const MOLT_DISPUTES_ADDRESS = process.env.MOLT_DISPUTES_ADDRESS ?? "0x0000000000000000000000000000000000000002";

/** First block to scan when no lastProcessedBlock is stored. Env: MOLT_START_BLOCK. */
function getStartBlock(): number {
  const raw = process.env.MOLT_START_BLOCK?.trim();
  if (raw === "") return 0;
  const n = parseInt(raw ?? "", 10);
  return Number.isNaN(n) || n < 0 ? 0 : n;
}

function getRpcUrl(): string | null {
  return process.env.BASE_RPC_URL?.trim() ?? null;
}

// Event signatures (keccak256 of EventName(address,uint256,...)) — placeholders; replace with real ABI.
const TASK_COMPLETED_TOPIC = ethers.id("TaskCompleted(address,uint256)");
const TASK_FAILED_TOPIC = ethers.id("TaskFailed(address,uint256)");
const DISPUTE_OPENED_TOPIC = ethers.id("DisputeOpened(address,uint256)");
const SLASHED_TOPIC = ethers.id("Slashed(address,uint256)");

const ONE_DAY_SEC = 24 * 60 * 60;

/** Extract wallet address from topic[1] (indexed address, 32-byte padded). */
function walletFromTopic(topic: string): string {
  const hex = topic.slice(-40);
  return ethers.getAddress("0x" + hex);
}

/**
 * Run incremental scan from lastProcessedBlock (or MOLT_START_BLOCK or 0) to latest for both contracts.
 * Updates cache and lastProcessedBlock. Idempotent per run (if already at latest, no-op).
 */
async function ensureIncrementalScan(provider: ethers.Provider): Promise<void> {
  const latestBlock = await provider.getBlockNumber();
  if (latestBlock == null) return;

  const startBlock = getStartBlock();
  const lastTasks = await getLastProcessedBlock(MOLT_TASKS_ADDRESS);
  const lastDisputes = await getLastProcessedBlock(MOLT_DISPUTES_ADDRESS);
  const fromBlockTasks = lastTasks != null ? lastTasks + 1 : startBlock;
  const fromBlockDisputes = lastDisputes != null ? lastDisputes + 1 : startBlock;

  if (fromBlockTasks <= latestBlock) {
    console.info(LOG, "Scanning from block", fromBlockTasks, "to", latestBlock, "(tasks)");
    const [completedLogs, failedLogs] = await Promise.all([
      provider.getLogs({
        address: MOLT_TASKS_ADDRESS as `0x${string}`,
        topics: [TASK_COMPLETED_TOPIC as `0x${string}`],
        fromBlock: fromBlockTasks,
        toBlock: latestBlock,
      }),
      provider.getLogs({
        address: MOLT_TASKS_ADDRESS as `0x${string}`,
        topics: [TASK_FAILED_TOPIC as `0x${string}`],
        fromBlock: fromBlockTasks,
        toBlock: latestBlock,
      }),
    ]);
    const tasksByWallet = new Map<string, { completed: number; failed: number }>();
    for (const log of completedLogs) {
      const w = log.topics?.[1] ? walletFromTopic(log.topics[1]) : null;
      if (!w) continue;
      const cur = tasksByWallet.get(w) ?? { completed: 0, failed: 0 };
      cur.completed += 1;
      tasksByWallet.set(w, cur);
    }
    for (const log of failedLogs) {
      const w = log.topics?.[1] ? walletFromTopic(log.topics[1]) : null;
      if (!w) continue;
      const cur = tasksByWallet.get(w) ?? { completed: 0, failed: 0 };
      cur.failed += 1;
      tasksByWallet.set(w, cur);
    }
    const blockTs = new Map<number, number>();
    const allTaskLogs = [...completedLogs, ...failedLogs];
    for (const log of allTaskLogs) {
      if (!blockTs.has(log.blockNumber)) {
        const b = await provider.getBlock(log.blockNumber);
        blockTs.set(log.blockNumber, b?.timestamp ?? 0);
      }
    }
    for (const [w, counts] of tasksByWallet) {
      const timestamps = allTaskLogs
        .filter((l) => l.topics?.[1] && walletFromTopic(l.topics[1]) === w)
        .map((l) => blockTs.get(l.blockNumber) ?? 0)
        .filter((t) => t > 0);
      const firstTs = timestamps.length > 0 ? Math.min(...timestamps) : 0;
      await mergeWalletMetrics(w, {
        tasksCompleted: counts.completed,
        tasksFailed: counts.failed,
        firstBlockTimestamp: firstTs > 0 ? firstTs : undefined,
      });
    }
    await setLastProcessedBlock(MOLT_TASKS_ADDRESS, latestBlock);
  }

  if (fromBlockDisputes <= latestBlock) {
    console.info(LOG, "Scanning from block", fromBlockDisputes, "to", latestBlock, "(disputes)");
    const [disputeLogs, slashLogs] = await Promise.all([
      provider.getLogs({
        address: MOLT_DISPUTES_ADDRESS as `0x${string}`,
        topics: [DISPUTE_OPENED_TOPIC as `0x${string}`],
        fromBlock: fromBlockDisputes,
        toBlock: latestBlock,
      }),
      provider.getLogs({
        address: MOLT_DISPUTES_ADDRESS as `0x${string}`,
        topics: [SLASHED_TOPIC as `0x${string}`],
        fromBlock: fromBlockDisputes,
        toBlock: latestBlock,
      }),
    ]);
    const disputesByWallet = new Map<string, number>();
    const slashesByWallet = new Map<string, number>();
    for (const log of disputeLogs) {
      const w = log.topics?.[1] ? walletFromTopic(log.topics[1]) : null;
      if (w) disputesByWallet.set(w, (disputesByWallet.get(w) ?? 0) + 1);
    }
    for (const log of slashLogs) {
      const w = log.topics?.[1] ? walletFromTopic(log.topics[1]) : null;
      if (w) slashesByWallet.set(w, (slashesByWallet.get(w) ?? 0) + 1);
    }
    for (const [w, n] of disputesByWallet) await mergeWalletMetrics(w, { disputes: n });
    for (const [w, n] of slashesByWallet) await mergeWalletMetrics(w, { slashes: n });
    await setLastProcessedBlock(MOLT_DISPUTES_ADDRESS, latestBlock);
  }
}

/**
 * Returns cumulative metrics for wallet. Runs incremental scan (from lastProcessedBlock to latest) then reads from cache.
 * If RPC or contracts are not configured, returns zeroed metrics.
 */
export async function getAgentMetrics(wallet: string): Promise<AgentMetrics> {
  const normalizedWallet = ethers.getAddress(wallet);
  const zero: AgentMetrics = {
    wallet: normalizedWallet,
    tasksCompleted: 0,
    tasksFailed: 0,
    disputes: 0,
    slashes: 0,
    ageDays: 0,
  };

  const rpcUrl = getRpcUrl();
  if (!rpcUrl) {
    console.warn(LOG, "BASE_RPC_URL not set, returning zero metrics", { wallet: wallet.slice(0, 10) + "..." });
    return { ...zero, wallet: normalizedWallet };
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);

  try {
    await ensureIncrementalScan(provider);
    const row = await getWalletMetricsRow(normalizedWallet);
    if (!row) {
      console.info(LOG, "getAgentMetrics", { walletShort: normalizedWallet.slice(0, 10) + "...", ...zero });
      return { ...zero, wallet: normalizedWallet };
    }
    const now = Math.floor(Date.now() / 1000);
    const ageDays =
      row.firstBlockTimestamp > 0
        ? Math.max(0, Math.floor((now - row.firstBlockTimestamp) / ONE_DAY_SEC))
        : 0;
    const metrics: AgentMetrics = {
      wallet: normalizedWallet,
      tasksCompleted: row.tasksCompleted,
      tasksFailed: row.tasksFailed,
      disputes: row.disputes,
      slashes: row.slashes,
      ageDays,
    };
    console.info(LOG, "getAgentMetrics", { walletShort: normalizedWallet.slice(0, 10) + "...", ...metrics });
    return metrics;
  } catch (e) {
    console.warn(LOG, "getAgentMetrics failed, returning zeros", {
      wallet: normalizedWallet.slice(0, 10) + "...",
      error: String(e),
    });
    return zero;
  }
}
