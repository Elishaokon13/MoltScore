import "dotenv/config";
import { pool } from "../lib/db";

async function main() {
  const cols = [
    "symbol TEXT",
    "market_cap_usd NUMERIC DEFAULT 0",
    "volume_24h_usd NUMERIC DEFAULT 0",
    "price_change_24h NUMERIC DEFAULT 0",
    "liquidity_usd NUMERIC DEFAULT 0",
    "holders INTEGER DEFAULT 0",
    "flaunch_token TEXT",
    "flaunch_url TEXT",
    "twitter TEXT",
    "x_verified BOOLEAN DEFAULT FALSE",
    "has_profile BOOLEAN DEFAULT FALSE",
    "endpoint TEXT",
    "price_wei TEXT",
    "gig_count INTEGER DEFAULT 0",
    "completed_tasks INTEGER DEFAULT 0",
    "active_tasks INTEGER DEFAULT 0",
    "last_active_at TIMESTAMPTZ",
    "rep_summary_value INTEGER DEFAULT 0",
    "rep_count INTEGER DEFAULT 0",
  ];

  for (const col of cols) {
    const colName = col.split(" ")[0];
    try {
      await pool.query(`ALTER TABLE mandate_agents ADD COLUMN IF NOT EXISTS ${col}`);
      console.log(`OK: ${colName}`);
    } catch (e) {
      console.log(`ERR: ${colName}`, (e as Error).message);
    }
  }

  console.log("All done");
  await pool.end();
}

main().catch(console.error);
