/**
 * GET /api/agent/:username — Agent profile by agent_id or name.
 * Queries mandate_agents table.
 */

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  if (!username || username.length < 1 || username.length > 200) {
    return NextResponse.json({ success: false, error: "Invalid identifier" }, { status: 400 });
  }

  try {
    // Try by agent_id (numeric), then by name (case-insensitive)
    const isNumeric = /^\d+$/.test(username);
    const result = isNumeric
      ? await pool.query(
          `SELECT * FROM mandate_agents WHERE agent_id = $1 LIMIT 1`,
          [parseInt(username, 10)]
        )
      : await pool.query(
          `SELECT * FROM mandate_agents WHERE LOWER(name) = $1 LIMIT 1`,
          [username.toLowerCase().trim()]
        );

    if (result.rows.length === 0) {
      return NextResponse.json({ success: false, error: "Agent not found" }, { status: 404 });
    }

    const r = result.rows[0];

    return NextResponse.json({
      success: true,
      agent: {
        agentId: r.agent_id,
        name: r.name,
        description: r.description,
        image: r.image_url,
        owner: r.owner_address,
        skills: r.skills ?? [],
        symbol: r.symbol,
        marketCap: parseFloat(r.market_cap ?? "0"),
        holders: r.holders ?? 0,
        xVerified: r.x_verified ?? false,
        repValue: r.rep_value ?? 0,
        repCount: r.rep_count ?? 0,
        completedTasks: r.completed_tasks ?? 0,
        activeTasks: r.active_tasks ?? 0,
        discoveredAt: r.discovered_at,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
