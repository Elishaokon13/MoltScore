/**
 * GET /api/leaderboard — top 50 scored agents from cache (Postgres).
 * No chain queries; read from DB only.
 */

import { getTopScored, getLastUpdated } from "@/lib/cache";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [agents, lastUpdatedMs] = await Promise.all([getTopScored(50), getLastUpdated()]);
    const lastUpdated =
      lastUpdatedMs > 0 ? new Date(lastUpdatedMs).toISOString() : new Date(0).toISOString();

    return NextResponse.json({
      success: true,
      count: agents.length,
      lastUpdated,
      agents,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
