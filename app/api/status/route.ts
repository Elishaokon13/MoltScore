/**
 * GET /api/status — monitoring stats from cache/DB only.
 * No heavy computation; read from Postgres and in-memory state.
 */

import { getCache, getReplyCountInLast24h } from "@/lib/cache";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [cache, repliesLast24h] = await Promise.all([getCache(), getReplyCountInLast24h()]);

    return NextResponse.json({
      lastUpdated: cache.lastUpdated,
      discoveredCount: cache.discovered.length,
      scoredCount: cache.scored.length,
      lastProcessedBlock: cache.lastProcessedBlockByContract,
      repliesLast24h,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
