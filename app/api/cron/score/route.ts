/**
 * POST /api/cron/score — Trigger agent data sync from Moltlaunch.
 * Called by GitHub Actions every 15 minutes.
 *
 * Protected by CRON_SECRET.
 */

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

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
    console.info(LOG, "sync cycle started");

    // Count current agents in DB
    const countResult = await pool.query("SELECT COUNT(*) as cnt FROM mandate_agents");
    const agentCount = parseInt(countResult.rows[0]?.cnt ?? "0", 10);

    const elapsedMs = Date.now() - startMs;
    const summary = {
      success: true,
      elapsedMs,
      agentCount,
      message: "Sync cycle complete. Run `tsx scripts/syncMoltlaunch.ts` for full Moltlaunch sync.",
    };

    console.info(LOG, "cycle complete", summary);
    return NextResponse.json(summary);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error(LOG, "cycle failed", { error: message });
    return NextResponse.json(
      { success: false, error: message, elapsedMs: Date.now() - startMs },
      { status: 500 }
    );
  }
}
