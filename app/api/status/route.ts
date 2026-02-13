/**
 * GET /api/status — monitoring stats from cache only.
 * No heavy computation; read from cache (or DB when migrated).
 */

import { getCache, getReplyCountInLast24h } from "@/lib/cache";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cache = getCache();

    return NextResponse.json({
      lastUpdated: cache.lastUpdated,
      discoveredCount: cache.discovered.length,
      scoredCount: cache.scored.length,
      lastProcessedBlock: cache.lastProcessedBlockByContract,
      repliesLast24h: getReplyCountInLast24h(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
