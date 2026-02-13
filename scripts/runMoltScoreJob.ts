/**
 * Run the MoltScore autonomous loop as a standalone process.
 * Usage: npx tsx scripts/runMoltScoreJob.ts
 * Or: node --import tsx scripts/runMoltScoreJob.ts
 *
 * Loads .env from project root (Next.js loads .env.local automatically in app; for CLI we use dotenv).
 */

import "dotenv/config";
import { runMoltScoreLoop, startAutonomousLoop } from "../jobs/autonomousLoop";

const runOnce = process.argv.includes("--once");

async function main() {
  if (runOnce) {
    console.info("[runMoltScoreJob] Running once (--once)");
    await runMoltScoreLoop();
    process.exit(0);
  }

  console.info("[runMoltScoreJob] Starting autonomous loop (every 15 min)");
  await runMoltScoreLoop();
  startAutonomousLoop();
  // Keep process alive
  await new Promise(() => {});
}

main().catch((e) => {
  console.error("[runMoltScoreJob]", e);
  process.exit(1);
});
