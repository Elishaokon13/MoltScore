/**
 * POST /api/agent/wallet/create
 *
 * Creates a new EOA wallet for an agent using ethers. Returns address + privateKey
 * once. MoltScore does NOT store the private key; the agent (or their platform)
 * must store it securely and use it to sign transactions (e.g. register on ERC-8004).
 */

import { NextResponse } from "next/server";
import { createAgentWallet } from "@/services/agentWallet";

export const dynamic = "force-dynamic";

export async function POST() {
  const result = createAgentWallet();
  // Do not log result — it contains the private key.
  return NextResponse.json(result, { status: 201 });
}
