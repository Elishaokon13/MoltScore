/**
 * Clear mandate_agents and repopulate from MoltLaunch API.
 * Run: npx tsx scripts/clearAndSyncAgents.ts
 */

import "dotenv/config";
import { pool } from "../lib/db";
import { runMoltlaunchSync } from "../services/moltlaunchSync";

async function main() {
  console.log("[clearAndSyncAgents] Truncating mandate_agents...");
  await pool.query("TRUNCATE TABLE mandate_agents");
  console.log("[clearAndSyncAgents] Table cleared. Syncing from MoltLaunch API...");
  const result = await runMoltlaunchSync(pool);
  console.log("[clearAndSyncAgents] Done:", result);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
