/**
 * POST /api/agent/register — Cache a newly registered agent into mandate_agents.
 * Called after on-chain registration via the Agent0 SDK (ERC-8004).
 * Upserts into mandate_agents so the agent appears immediately in the directory.
 */

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

interface RegisterRequest {
  agentId: number;
  owner: string;
  name: string;
  description?: string | null;
  image?: string | null;
  endpoint?: string | null;
}

const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/;

export async function POST(req: NextRequest) {
  let body: RegisterRequest;
  try {
    body = (await req.json()) as RegisterRequest;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { agentId, owner, name, description, image, endpoint } = body;

  if (!agentId || typeof agentId !== "number" || agentId <= 0) {
    return NextResponse.json(
      { success: false, error: "Invalid agentId" },
      { status: 400 }
    );
  }

  if (!owner || !WALLET_REGEX.test(owner)) {
    return NextResponse.json(
      { success: false, error: "Invalid owner address" },
      { status: 400 }
    );
  }

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { success: false, error: "Name is required" },
      { status: 400 }
    );
  }

  try {
    await pool.query(
      `INSERT INTO mandate_agents (
        agent_id, owner_address, name, description, image_url, endpoint, discovered_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (agent_id) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, mandate_agents.name),
        description = COALESCE(EXCLUDED.description, mandate_agents.description),
        image_url = COALESCE(EXCLUDED.image_url, mandate_agents.image_url),
        endpoint = COALESCE(EXCLUDED.endpoint, mandate_agents.endpoint),
        owner_address = COALESCE(EXCLUDED.owner_address, mandate_agents.owner_address)
      `,
      [
        agentId,
        owner,
        name.trim(),
        description?.trim() || null,
        image?.trim() || null,
        endpoint?.trim() || null,
      ]
    );

    return NextResponse.json(
      {
        success: true,
        status: "registered",
        agentId,
        message: `Agent "${name}" cached. Will be fully indexed on next sync cycle.`,
        profileUrl: `/agent/${agentId}`,
      },
      { status: 201 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[API /agent/register]", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
