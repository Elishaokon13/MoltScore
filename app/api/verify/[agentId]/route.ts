/**
 * GET /api/verify/:agentId — Get a verifiable score from EigenCompute TEE.
 * Builds score input with on-chain data; when on-chain reputation is empty,
 * uses MoltLaunch API (off-chain) so the attestation is "on-chain + attested off-chain".
 * POSTs the input to the TEE so the score reflects both sources.
 */

import { NextRequest, NextResponse } from "next/server";
import { buildScoreInputForTee } from "@/services/verifiableScoreInput";

export const dynamic = "force-dynamic";

const EIGENCOMPUTE_URL = process.env.EIGENCOMPUTE_URL || "";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;
  const id = parseInt(agentId, 10);

  if (isNaN(id) || id < 0) {
    return NextResponse.json({ success: false, error: "Invalid agentId" }, { status: 400 });
  }

  if (!EIGENCOMPUTE_URL) {
    return NextResponse.json(
      {
        success: false,
        error: "EigenCompute service not configured",
        hint: "Set EIGENCOMPUTE_URL in environment variables",
      },
      { status: 503 }
    );
  }

  try {
    const { input, reputationSource } = await buildScoreInputForTee(id);

    const res = await fetch(`${EIGENCOMPUTE_URL}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return NextResponse.json(
        { success: false, error: body.error || `EigenCompute returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json({
      success: true,
      reputationSource,
      ...data,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
