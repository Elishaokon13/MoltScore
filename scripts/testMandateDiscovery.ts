/**
 * Test the Mandate discovery service.
 * Creates the mandate_agents table if needed, then runs a discovery scan.
 *
 * Run: npx tsx scripts/testMandateDiscovery.ts
 * (picks up .env automatically via dotenv/config)
 */

import "dotenv/config";
import { pool } from "../lib/db";
import {
  discoverAgents,
  getDiscoveredAgentCount,
  getAllAgentIds,
} from "../services/mandateDiscovery";

async function ensureTables() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS scan_state (
        contract_key TEXT PRIMARY KEY,
        last_block BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS mandate_agents (
        agent_id INT PRIMARY KEY,
        owner_address TEXT NOT NULL,
        wallet_address TEXT,
        agent_uri TEXT,
        mandates_as_worker INT NOT NULL DEFAULT 0,
        mandates_as_creator INT NOT NULL DEFAULT 0,
        mandates_completed INT NOT NULL DEFAULT 0,
        mandates_disputed INT NOT NULL DEFAULT 0,
        mandates_cancelled INT NOT NULL DEFAULT 0,
        total_earned_wei TEXT NOT NULL DEFAULT '0',
        feedback_count INT NOT NULL DEFAULT 0,
        avg_feedback_value FLOAT NOT NULL DEFAULT 0,
        unique_reviewers INT NOT NULL DEFAULT 0,
        score INT,
        tier TEXT,
        score_components JSONB,
        last_scored_at TIMESTAMPTZ,
        discovered_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS mandate_agents_score_idx ON mandate_agents(score DESC NULLS LAST)`);
    await client.query(`CREATE INDEX IF NOT EXISTS mandate_agents_wallet_idx ON mandate_agents(wallet_address)`);
    console.log("[Test] Tables ready (scan_state + mandate_agents)");
  } finally {
    client.release();
  }
}

async function main() {
  console.log("=== Mandate Discovery Test ===\n");

  // Step 1: Ensure tables exist
  await ensureTables();

  // Step 2: Check current count
  const beforeCount = await getDiscoveredAgentCount();
  console.log(`  Agents before scan: ${beforeCount}\n`);

  // Step 3: Run discovery (this will scan incrementally)
  console.log("  Starting discovery scan...\n");
  const result = await discoverAgents();
  console.log(`\n  Discovery result:`);
  console.log(`    newAgents: ${result.newAgents}`);
  console.log(`    totalScanned: ${result.totalScanned}`);
  console.log(`    fromBlock: ${result.fromBlock}`);
  console.log(`    toBlock: ${result.toBlock}`);

  // Step 4: Check updated count
  const afterCount = await getDiscoveredAgentCount();
  console.log(`\n  Agents after scan: ${afterCount}`);

  // Step 5: Show a sample of agents
  const allIds = await getAllAgentIds();
  console.log(`\n  Total agent IDs in DB: ${allIds.length}`);
  if (allIds.length > 0) {
    const sample = allIds.slice(0, 5);
    console.log(`  First 5 IDs: [${sample.join(", ")}]`);

    // Read a sample agent from DB
    const res = await pool.query(
      `SELECT agent_id, owner_address, wallet_address, agent_uri FROM mandate_agents WHERE agent_id = $1`,
      [sample[0]]
    );
    if (res.rows[0]) {
      const a = res.rows[0];
      console.log(`\n  Sample agent #${a.agent_id}:`);
      console.log(`    owner: ${a.owner_address}`);
      console.log(`    wallet: ${a.wallet_address}`);
      console.log(`    uri: ${(a.agent_uri || "(empty)").slice(0, 80)}`);
    }
  }

  console.log("\n=== Done ===");
  await pool.end();
}

main().catch((e) => {
  console.error("Test failed:", e);
  pool.end().then(() => process.exit(1));
});
