/**
 * POST /api/agent/register — Self-registration for agents.
 * Agents (or their operators) can submit a username + optional wallet to join the reputation system.
 * If already discovered, updates wallet. If already scored, returns current score.
 * Agent will be scored on the next cron cycle.
 */

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

interface RegisterRequest {
  username: string;
  wallet?: string;
}

const WALLET_REGEX = /^0x[a-fA-F0-9]{40}$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_.-]{1,100}$/;

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

  const username = body.username?.trim();
  const wallet = body.wallet?.trim() || null;

  if (!username || !USERNAME_REGEX.test(username)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid username. Must be 1-100 characters, alphanumeric with _ . - allowed.",
      },
      { status: 400 }
    );
  }

  if (wallet && !WALLET_REGEX.test(wallet)) {
    return NextResponse.json(
      { success: false, error: "Invalid wallet address. Must be a valid 0x address." },
      { status: 400 }
    );
  }

  try {
    // Upsert into discovered_agents
    await pool.query(
      `INSERT INTO discovered_agents (username, wallet, last_seen_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (username) DO UPDATE SET
         wallet = COALESCE($2, discovered_agents.wallet),
         last_seen_at = NOW()`,
      [username, wallet]
    );

    // Check if already scored (return current score)
    const scoredResult = await pool.query(
      `SELECT score, tier, updated_at FROM scored_agents WHERE LOWER(username) = $1`,
      [username.toLowerCase()]
    );

    if (scoredResult.rows.length > 0) {
      const row = scoredResult.rows[0] as {
        score: number;
        tier: string;
        updated_at: Date;
      };
      return NextResponse.json({
        success: true,
        status: "scored",
        message: `Agent "${username}" is already scored. Score will update on next cycle.`,
        currentScore: row.score,
        currentTier: row.tier,
        lastUpdated: new Date(row.updated_at).toISOString(),
        profileUrl: `/api/agent/${encodeURIComponent(username)}`,
      });
    }

    // Agent registered but not yet scored
    return NextResponse.json(
      {
        success: true,
        status: "registered",
        message: `Agent "${username}" registered. Will be scored on the next cycle (runs every 15 minutes).`,
        profileUrl: `/api/agent/${encodeURIComponent(username)}`,
      },
      { status: 201 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
