/**
 * One-off MoltCourt sync. Usage: npm run sync:moltcourt
 */

import "dotenv/config";
import { MoltCourtSyncService } from "../services/moltcourtSync";

async function main() {
  const sync = new MoltCourtSyncService();
  await sync.syncAgents();
  await sync.syncRecentFights();
  console.log("[syncMoltCourt] Done.");
}

main().catch((e) => {
  console.error("[syncMoltCourt]", e);
  process.exit(1);
});
