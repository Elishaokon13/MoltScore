/**
 * GET /api/status — System health and agent counts.
 */

import { pool } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [totalResult, scoredResult] = await Promise.all([
      pool.query("SELECT COUNT(*) as cnt FROM mandate_agents"),
      pool.query("SELECT COUNT(*) as cnt FROM mandate_agents WHERE rep_value > 0"),
    ]);

    return NextResponse.json({
      success: true,
      totalAgents: parseInt(totalResult.rows[0]?.cnt ?? "0", 10),
      scoredAgents: parseInt(scoredResult.rows[0]?.cnt ?? "0", 10),
      uptime: process.uptime(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
