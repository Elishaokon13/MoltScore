/**
 * Run MoltLaunch → mandate_agents sync once (all pages, list data only).
 * Use this to bring the DB up to 122 agents without waiting for the daily cron.
 *
 * Run: npx tsx scripts/runMoltlaunchSync.ts
 */

import "dotenv/config";
import { pool } from "../lib/db";
import { runMoltlaunchSync } from "../services/moltlaunchSync";

async function main() {
  console.log("[runMoltlaunchSync] Starting...");
  const result = await runMoltlaunchSync(pool);
  console.log("[runMoltlaunchSync] Done:", result);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
