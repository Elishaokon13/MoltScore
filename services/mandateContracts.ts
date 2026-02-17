/**
 * Mandate Protocol contract instances and ABIs for Base chain.
 *
 * Identity Registry: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 (verified)
 * Escrow (MandateEscrowV5): 0x5Df1ffa02c8515a0Fed7d0e5d6375FcD2c1950Ee (unverified, ABI from bytecode)
 * Reputation Registry: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63 (verified)
 */

import { ethers } from "ethers";
import IdentityAbiJson from "@/abis/IdentityAbi.json";
import ReputationAbiJson from "@/abis/ReputationAbi.json";

const LOG = "[MandateContracts]";

// ---------------------------------------------------------------------------
// Contract addresses (Base Mainnet)
// ---------------------------------------------------------------------------
export const IDENTITY_ADDRESS = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
export const ESCROW_ADDRESS = "0x5Df1ffa02c8515a0Fed7d0e5d6375FcD2c1950Ee";
export const REPUTATION_ADDRESS = "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63";

// ---------------------------------------------------------------------------
// Escrow status enum (from bytecode analysis)
// ---------------------------------------------------------------------------
export enum MandateStatus {
  Pending = 0,
  Quoted = 1,
  Submitted = 2,
  Disputed = 3,
  Completed = 4,
  Cancelled = 5,
  Refunded = 6,
  Rejected = 7,
}

export const MANDATE_STATUS_LABELS: Record<number, string> = {
  [MandateStatus.Pending]: "Pending",
  [MandateStatus.Quoted]: "Quoted",
  [MandateStatus.Submitted]: "Submitted",
  [MandateStatus.Disputed]: "Disputed",
  [MandateStatus.Completed]: "Completed",
  [MandateStatus.Cancelled]: "Cancelled",
  [MandateStatus.Refunded]: "Refunded",
  [MandateStatus.Rejected]: "Rejected",
};

// ---------------------------------------------------------------------------
// TypeScript interfaces for contract data
// ---------------------------------------------------------------------------
export interface MandateAgent {
  agentId: number;
  owner: string;
  wallet: string;
  agentURI: string;
}

export interface Mandate {
  /** bytes32 mandate ID (hex string) */
  mandateId: string;
  creator: string;
  worker: string;
  resolver: string;
  amount: bigint;
  createdAt: bigint;
  submittedAt: bigint;
  disputeDeposit: bigint;
  status: MandateStatus;
}

export interface ReputationFeedback {
  client: string;
  feedbackIndex: number;
  value: bigint;
  valueDecimals: number;
  tag1: string;
  tag2: string;
  isRevoked: boolean;
}

export interface ReputationSummary {
  count: number;
  summaryValue: bigint;
  summaryValueDecimals: number;
}

// ---------------------------------------------------------------------------
// ABIs
// ---------------------------------------------------------------------------

/** Identity Registry ABI — official, from verified implementation contract. */
export const IDENTITY_ABI = IdentityAbiJson;

/**
 * Escrow ABI — derived from bytecode analysis of MandateEscrowV5.
 * Contract is unverified; selectors confirmed via on-chain probing.
 *
 * Key finding: mandateIds are bytes32 hashes, NOT sequential uint256.
 * The mapping is `mapping(bytes32 => Escrow)` with getter `escrows(bytes32)`.
 */
export const ESCROW_ABI = [
  // Auto-generated getter for `mapping(bytes32 => Escrow) public escrows`
  // Function selector: 0x2d83549c (confirmed)
  "function escrows(bytes32 mandateId) view returns (address creator, address worker, address resolver, uint256 amount, uint256 createdAt, uint256 submittedAt, uint256 disputeDeposit, uint8 status)",
  // Status getter — selector: 0x5de28ae0 (confirmed)
  "function getStatus(bytes32 mandateId) view returns (uint8)",
];

// Raw selectors for Escrow functions where actual names are unknown (unverified contract)
export const ESCROW_RAW_SELECTORS = {
  platformFee: "0x14ecae36",  // () → uint256 (returns 1500 = 15% basis points)
  cancelFee: "0xdf54df91",    // () → uint256 (returns 1000 = 10% basis points)
  release: "0x67d42a8b",      // (bytes32) — state changer, not used by us
};

/** Reputation Registry ABI — official, from verified implementation contract. */
export const REPUTATION_ABI = ReputationAbiJson;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
let _provider: ethers.JsonRpcProvider | null = null;

export function getProvider(): ethers.JsonRpcProvider | null {
  if (_provider) return _provider;
  const rpcUrl = process.env.BASE_RPC_URL?.trim();
  if (!rpcUrl) {
    console.warn(LOG, "BASE_RPC_URL not set — Mandate contracts unavailable");
    return null;
  }
  _provider = new ethers.JsonRpcProvider(rpcUrl);
  return _provider;
}

// ---------------------------------------------------------------------------
// Contract instances (lazy, read-only)
// ---------------------------------------------------------------------------
let _identity: ethers.Contract | null = null;
let _escrow: ethers.Contract | null = null;
let _reputation: ethers.Contract | null = null;

export function getIdentityContract(): ethers.Contract | null {
  if (_identity) return _identity;
  const provider = getProvider();
  if (!provider) return null;
  _identity = new ethers.Contract(IDENTITY_ADDRESS, IDENTITY_ABI, provider);
  return _identity;
}

export function getEscrowContract(): ethers.Contract | null {
  if (_escrow) return _escrow;
  const provider = getProvider();
  if (!provider) return null;
  _escrow = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, provider);
  return _escrow;
}

export function getReputationContract(): ethers.Contract | null {
  if (_reputation) return _reputation;
  const provider = getProvider();
  if (!provider) return null;
  _reputation = new ethers.Contract(REPUTATION_ADDRESS, REPUTATION_ABI, provider);
  return _reputation;
}

// ---------------------------------------------------------------------------
// RPC retry helper (public Base RPC rate-limits aggressively)
// ---------------------------------------------------------------------------
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const msg = String(e);
      const isRateLimit = msg.includes("missing revert data") && msg.includes("data=null");
      if (isRateLimit && attempt < MAX_RETRIES) {
        console.warn(LOG, `${label} — RPC rate limit, retry ${attempt}/${MAX_RETRIES}...`);
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
        continue;
      }
      throw e;
    }
  }
  throw new Error("unreachable");
}

// ---------------------------------------------------------------------------
// High-level read helpers
// ---------------------------------------------------------------------------

/** Read a single agent from the Identity Registry by token ID. */
export async function readAgent(agentId: number): Promise<MandateAgent | null> {
  const contract = getIdentityContract();
  if (!contract) return null;
  try {
    const [owner, wallet, uri] = await Promise.all([
      withRetry(() => contract.ownerOf(agentId) as Promise<string>, `ownerOf(${agentId})`),
      withRetry(() => contract.getAgentWallet(agentId) as Promise<string>, `getAgentWallet(${agentId})`),
      contract.tokenURI(agentId).catch(() => "") as Promise<string>,
    ]);
    return { agentId, owner, wallet, agentURI: uri };
  } catch (e) {
    const msg = String(e);
    if (msg.includes("ERC721NonexistentToken") || msg.includes("nonexistent")) return null;
    console.warn(LOG, `readAgent(${agentId}) failed:`, msg.slice(0, 200));
    return null;
  }
}

/** Read a mandate from the Escrow contract by bytes32 ID. */
export async function readMandate(mandateId: string): Promise<Mandate | null> {
  const contract = getEscrowContract();
  if (!contract) return null;
  try {
    const m = await withRetry(() => contract.escrows(mandateId), `escrows(${mandateId.slice(0, 18)})`);
    if (!m || m.creator === ethers.ZeroAddress) return null;
    return {
      mandateId,
      creator: m.creator,
      worker: m.worker,
      resolver: m.resolver,
      amount: m.amount,
      createdAt: m.createdAt,
      submittedAt: m.submittedAt,
      disputeDeposit: m.disputeDeposit,
      status: Number(m.status) as MandateStatus,
    };
  } catch (e) {
    console.warn(LOG, `readMandate(${mandateId.slice(0, 18)}) failed:`, String(e).slice(0, 200));
    return null;
  }
}

/** Read reputation summary for an agent (aggregate across all reviewers). */
export async function readReputationSummary(agentId: number): Promise<ReputationSummary | null> {
  const contract = getReputationContract();
  if (!contract) return null;
  try {
    const rawClients = await withRetry(() => contract.getClients(agentId), `getClients(${agentId})`);
    const clients: string[] = [...rawClients];
    if (clients.length === 0) return { count: 0, summaryValue: BigInt(0), summaryValueDecimals: 0 };
    const result = await withRetry(() => contract.getSummary(agentId, clients, "", ""), `getSummary(${agentId})`);
    return {
      count: Number(result.count),
      summaryValue: result.summaryValue,
      summaryValueDecimals: Number(result.summaryValueDecimals),
    };
  } catch (e) {
    console.warn(LOG, `readReputationSummary(${agentId}) failed:`, String(e).slice(0, 200));
    return null;
  }
}

/** Read all individual feedback entries for an agent. */
export async function readAllFeedback(agentId: number): Promise<ReputationFeedback[]> {
  const contract = getReputationContract();
  if (!contract) return [];
  try {
    const rawClients = await withRetry(() => contract.getClients(agentId), `getClients(${agentId})`);
    const clients: string[] = [...rawClients];
    if (clients.length === 0) return [];
    const result = await withRetry(
      () => contract.readAllFeedback(agentId, clients, "", "", false),
      `readAllFeedback(${agentId})`
    );
    const feedbacks: ReputationFeedback[] = [];
    for (let i = 0; i < result.clients.length; i++) {
      feedbacks.push({
        client: result.clients[i],
        feedbackIndex: Number(result.feedbackIndexes[i]),
        value: result.values[i],
        valueDecimals: Number(result.valueDecimals[i]),
        tag1: result.tag1s[i],
        tag2: result.tag2s[i],
        isRevoked: result.revokedStatuses[i],
      });
    }
    return feedbacks;
  } catch (e) {
    console.warn(LOG, `readAllFeedback(${agentId}) failed:`, String(e).slice(0, 200));
    return [];
  }
}

/** Get the total number of unique reviewers for an agent. */
export async function getReviewerCount(agentId: number): Promise<number> {
  const contract = getReputationContract();
  if (!contract) return 0;
  try {
    const rawClients = await withRetry(() => contract.getClients(agentId), `getClients(${agentId})`);
    return rawClients?.length ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Smoke-test: verify contracts are reachable by calling a simple view function.
 * Returns { identity, escrow, reputation } with version strings or error messages.
 */
export async function healthCheck(): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  const identity = getIdentityContract();
  const reputation = getReputationContract();
  const escrow = getEscrowContract();
  const provider = getProvider();

  if (identity) {
    try {
      result.identity = `v${await identity.getVersion()} — OK`;
    } catch (e) {
      result.identity = `ERROR: ${String(e).slice(0, 100)}`;
    }
  } else {
    result.identity = "NO_PROVIDER";
  }

  if (reputation) {
    try {
      result.reputation = `v${await reputation.getVersion()} — OK`;
    } catch (e) {
      result.reputation = `ERROR: ${String(e).slice(0, 100)}`;
    }
  } else {
    result.reputation = "NO_PROVIDER";
  }

  // Escrow health check uses raw selector since function names are unknown (unverified)
  if (provider) {
    try {
      const feeData = await provider.call({ to: ESCROW_ADDRESS, data: ESCROW_RAW_SELECTORS.platformFee });
      const fee = parseInt(feeData, 16);
      result.escrow = `platformFee=${fee}bps — OK`;
    } catch (e) {
      result.escrow = `ERROR: ${String(e).slice(0, 100)}`;
    }
  } else {
    result.escrow = "NO_PROVIDER";
  }

  return result;
}
