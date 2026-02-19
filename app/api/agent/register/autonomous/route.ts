/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { encodeFunctionData } from "viem";
import IdentityAbiJson from "@/abis/IdentityAbi.json";
import {
  isBankrConfigured,
  submitTransactionViaBankr,
} from "@/services/bankr";
import { IDENTITY_ADDRESS } from "@/services/mandateContracts";

export const dynamic = "force-dynamic";

const BASE_CHAIN_ID = 8453;
const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/;

interface AutonomousRegisterRequest {
  agentWallet: string;
  name: string;
  description?: string;
  imageUrl?: string;
  endpoint?: string;
  /** If true and BANKR_API_KEY is set, submit the tx via Bankr (wallet tied to that key pays gas and becomes identity owner). */
  submitViaBankr?: boolean;
}

export async function POST(req: NextRequest) {
  let body: AutonomousRegisterRequest;

  try {
    body = (await req.json()) as AutonomousRegisterRequest;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { agentWallet, name, description, imageUrl, endpoint, submitViaBankr } =
    body ?? {};

  if (!agentWallet || !WALLET_REGEX.test(agentWallet)) {
    return NextResponse.json(
      { success: false, error: "Invalid agentWallet address" },
      { status: 400 }
    );
  }

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { success: false, error: "Name is required" },
      { status: 400 }
    );
  }

  const trimmedName = name.trim();
  const metadata: Record<string, string> = { name: trimmedName };

  if (description && typeof description === "string" && description.trim().length > 0) {
    metadata.description = description.trim();
  }

  if (imageUrl && typeof imageUrl === "string" && imageUrl.trim().length > 0) {
    metadata.image = imageUrl.trim();
  }

  if (endpoint && typeof endpoint === "string" && endpoint.trim().length > 0) {
    metadata.endpoint = endpoint.trim();
  }

  const agentURI = `data:application/json,${encodeURIComponent(
    JSON.stringify(metadata)
  )}`;

  let data: `0x${string}`;
  try {
    data = encodeFunctionData({
      abi: IdentityAbiJson as any,
      functionName: "register",
      args: [agentURI],
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to encode register() calldata";
    console.error("[API /agent/register/autonomous] encode error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }

  if (submitViaBankr && isBankrConfigured()) {
    try {
      const result = await submitTransactionViaBankr(
        {
          to: IDENTITY_ADDRESS,
          chainId: BASE_CHAIN_ID,
          value: "0",
          data,
        },
        {
          description: `MoltScore register: ${trimmedName}`,
          waitForConfirmation: true,
        }
      );
      if (!result.success) {
        return NextResponse.json(
          {
            success: false,
            error: result.error || "Bankr submission failed",
            bankr: { status: result.status, signer: result.signer },
          },
          { status: 502 }
        );
      }
      return NextResponse.json(
        {
          success: true,
          submittedViaBankr: true,
          transactionHash: result.transactionHash,
          status: result.status,
          signer: result.signer,
          chainId: BASE_CHAIN_ID,
          agentURI,
          summary: {
            note: "Transaction submitted via Bankr. The signer (Bankr wallet) is the ERC-8004 identity owner. Use the transaction receipt logs to get agentId, then call POST /api/agent/register to cache.",
            function: "register(string agentURI)",
          },
        },
        { status: 200 }
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Bankr submit failed";
      console.error("[API /agent/register/autonomous] Bankr error:", message);
      return NextResponse.json(
        { success: false, error: message },
        { status: 502 }
      );
    }
  }

  return NextResponse.json(
    {
      success: true,
      chainId: BASE_CHAIN_ID,
      to: IDENTITY_ADDRESS,
      data,
      agentURI,
      ...(submitViaBankr && !isBankrConfigured() && {
        submitViaBankrSkipped: true,
        reason: "BANKR_API_KEY not set",
      }),
      summary: {
        note: "Submit this transaction from the agent's wallet on Base. The wallet must hold enough ETH for gas.",
        function: "register(string agentURI)",
      },
    },
    { status: 200 }
  );
}

