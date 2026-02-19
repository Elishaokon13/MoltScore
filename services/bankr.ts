/**
 * Bankr Agent API client.
 *
 * Docs: https://docs.bankr.bot/agent-api/overview/
 * - One API key = one custodial wallet (the wallet that signs/submits).
 * - POST /agent/submit — submit a transaction (sign + broadcast).
 * - POST /agent/sign — sign only, no broadcast.
 */

const BANKR_API_BASE = process.env.BANKR_API_BASE || "https://api.bankr.bot";
const BANKR_API_KEY = process.env.BANKR_API_KEY || "";

export interface BankrSubmitTransactionParams {
  to: string;
  chainId: number;
  value?: string;
  data?: `0x${string}`;
  gas?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: number;
}

export interface BankrSubmitOptions {
  description?: string;
  waitForConfirmation?: boolean;
}

export interface BankrSubmitResult {
  success: boolean;
  transactionHash?: `0x${string}`;
  status?: "success" | "reverted" | "pending";
  blockNumber?: string;
  gasUsed?: string;
  signer?: string;
  chainId?: number;
  error?: string;
}

/**
 * Submit a transaction via Bankr's Agent API.
 * Uses the wallet associated with BANKR_API_KEY (one wallet per key).
 */
export async function submitTransactionViaBankr(
  transaction: BankrSubmitTransactionParams,
  options: BankrSubmitOptions = {}
): Promise<BankrSubmitResult> {
  if (!BANKR_API_KEY) {
    throw new Error("[Bankr] BANKR_API_KEY is not set");
  }

  const body = {
    transaction: {
      to: transaction.to,
      chainId: transaction.chainId,
      value: transaction.value ?? "0",
      data: transaction.data ?? "0x",
      ...(transaction.gas && { gas: transaction.gas }),
      ...(transaction.maxFeePerGas && { maxFeePerGas: transaction.maxFeePerGas }),
      ...(transaction.maxPriorityFeePerGas && {
        maxPriorityFeePerGas: transaction.maxPriorityFeePerGas,
      }),
      ...(transaction.nonce !== undefined && { nonce: transaction.nonce }),
    },
    ...(options.description && { description: options.description }),
    ...(options.waitForConfirmation !== undefined && {
      waitForConfirmation: options.waitForConfirmation,
    }),
  };

  const res = await fetch(`${BANKR_API_BASE}/agent/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": BANKR_API_KEY,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as {
    success?: boolean;
    transactionHash?: string;
    status?: string;
    blockNumber?: string;
    gasUsed?: string;
    signer?: string;
    chainId?: number;
    error?: string;
    message?: string;
  };

  if (!res.ok) {
    throw new Error(
      data.error || data.message || `Bankr API error: ${res.status}`
    );
  }

  return {
    success: data.success ?? false,
    transactionHash: data.transactionHash as `0x${string}` | undefined,
    status: data.status as "success" | "reverted" | "pending" | undefined,
    blockNumber: data.blockNumber,
    gasUsed: data.gasUsed,
    signer: data.signer,
    chainId: data.chainId,
    error: data.error,
  };
}

/** Whether Bankr integration is configured (key set). */
export function isBankrConfigured(): boolean {
  return Boolean(BANKR_API_KEY);
}
