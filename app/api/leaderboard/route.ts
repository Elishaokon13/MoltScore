/**
 * GET /api/leaderboard — Top agents ranked by reputation.
 * Queries the mandate_agents table directly.
 */

import { pool } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));

    const result = await pool.query(
      `SELECT
        agent_id,
        name,
        description,
        image_url,
        owner_address,
        skills,
        symbol,
        market_cap,
        holders,
        x_verified,
        rep_value,
        rep_count,
        completed_tasks,
        active_tasks,
        discovered_at
      FROM mandate_agents
      WHERE name IS NOT NULL
      ORDER BY rep_value DESC NULLS LAST, market_cap DESC NULLS LAST
      LIMIT $1`,
      [limit]
    );

    const agents = result.rows.map((row, index) => ({
      rank: index + 1,
      agentId: row.agent_id,
      name: row.name,
      description: row.description,
      image: row.image_url,
      owner: row.owner_address,
      skills: row.skills ?? [],
      symbol: row.symbol,
      marketCap: parseFloat(row.market_cap ?? "0"),
      holders: row.holders ?? 0,
      xVerified: row.x_verified ?? false,
      repValue: row.rep_value ?? 0,
      repCount: row.rep_count ?? 0,
      completedTasks: row.completed_tasks ?? 0,
      activeTasks: row.active_tasks ?? 0,
      discoveredAt: row.discovered_at,
    }));

    return NextResponse.json({
      success: true,
      count: agents.length,
      agents,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
