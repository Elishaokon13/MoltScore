/**
 * Create a new EOA wallet for an agent using ethers.
 * The private key is returned once and must be stored by the agent;
 * we never persist it.
 */

import { Wallet } from "ethers";

const BASE_CHAIN_ID = 8453;

export interface CreateAgentWalletResult {
  address: string;
  privateKey: string;
  chainId: number;
  warning: string;
}

/**
 * Generate a new random wallet. Caller must return the private key to the
 * agent once and must never log or persist it.
 */
export function createAgentWallet(): CreateAgentWalletResult {
  const wallet = Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    chainId: BASE_CHAIN_ID,
    warning:
      "Store the private key securely. MoltScore does not store it. Fund this address on Base to pay for registration gas.",
  };
}
