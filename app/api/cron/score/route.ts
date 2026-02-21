/**
 * POST /api/cron/score — Sync agent data from MoltLaunch API into DB.
 * Fetches all pages from api.moltlaunch.com/api/agents and upserts into mandate_agents.
 * Call on a schedule (e.g. Vercel Cron every 15 min) or manually with CRON_SECRET.
 *
 * Protected by CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { runMoltlaunchSync } from "@/services/moltlaunchSync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LOG = "[CronScore]";

function verifyAuth(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn(LOG, "CRON_SECRET not set — rejecting");
    return false;
  }
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader.replace(/^Bearer\s+/i, "") === secret;
}

export async function POST(req: NextRequest) {
  const startMs = Date.now();

  if (!verifyAuth(req)) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.info(LOG, "MoltLaunch sync started");

    const result = await runMoltlaunchSync(pool);

    const elapsedMs = Date.now() - startMs;
    const summary = {
      success: true,
      elapsedMs,
      totalFromApi: result.totalFromApi,
      totalPages: result.totalPages,
      synced: result.synced,
      errors: result.errors,
      dbCount: result.dbCount,
    };

    console.info(LOG, "sync complete", summary);
    return NextResponse.json(summary);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error(LOG, "sync failed", { error: message });
    return NextResponse.json(
      { success: false, error: message, elapsedMs: Date.now() - startMs },
      { status: 500 }
    );
  }
}
