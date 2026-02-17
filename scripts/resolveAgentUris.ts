/**
 * Resolve agent URIs from the Identity Registry for agents that have no URI.
 * Calls agentURI(agentId) on-chain for each agent missing a URI.
 * Run: npx tsx scripts/resolveAgentUris.ts
 */

import "dotenv/config";
import { ethers } from "ethers";
import { pool } from "../lib/db";
import { IDENTITY_ADDRESS } from "../services/mandateContracts";
import IdentityAbiJson from "../abis/IdentityAbi.json";

const RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const BATCH_SIZE = 10;
const DELAY_MS = 500;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 10000)),
      ]);
      return result;
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(1000 * (i + 1));
    }
  }
  throw new Error("unreachable");
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const identity = new ethers.Contract(IDENTITY_ADDRESS, IdentityAbiJson, provider);

  // Get agents with no URI
  const res = await pool.query(
    "SELECT agent_id FROM mandate_agents WHERE (agent_uri IS NULL OR agent_uri = '') ORDER BY agent_id"
  );

  console.log(`[resolve-uri] ${res.rows.length} agents need URI resolution`);

  let resolved = 0;
  let empty = 0;
  let errors = 0;

  for (let i = 0; i < res.rows.length; i += BATCH_SIZE) {
    const batch = res.rows.slice(i, i + BATCH_SIZE);

    for (const row of batch) {
      try {
        const uri = await withRetry(() => identity.tokenURI(row.agent_id));
        const uriStr = String(uri).trim();

        if (uriStr) {
          await pool.query(
            "UPDATE mandate_agents SET agent_uri = $2 WHERE agent_id = $1",
            [row.agent_id, uriStr]
          );
          resolved++;
        } else {
          empty++;
        }
      } catch (e) {
        errors++;
        if (errors <= 5) console.log(`[resolve-uri] Error on agent ${row.agent_id}:`, (e as Error).message);
      }
    }

    if ((i + BATCH_SIZE) % 100 === 0 || i + BATCH_SIZE >= res.rows.length) {
      console.log(
        `[resolve-uri] Progress: ${Math.min(i + BATCH_SIZE, res.rows.length)}/${res.rows.length} (resolved: ${resolved}, empty: ${empty}, errors: ${errors})`
      );
    }
    await sleep(DELAY_MS);
  }

  console.log(`[resolve-uri] Done. Resolved: ${resolved}, Empty: ${empty}, Errors: ${errors}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
