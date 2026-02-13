/**
 * GET /api/leaderboard — top 50 scored agents from cache.
 * No chain queries; all data from background job cache.
 */

import { getTopScored, getCache } from "@/lib/cache";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cache = getCache();
    const top = getTopScored(50);

    return NextResponse.json({
      success: true,
      count: top.length,
      lastUpdated: cache.lastUpdated,
      agents: top,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
