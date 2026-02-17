/**
 * Comprehensive smoke test for Mandate contract service layer.
 * Run: BASE_RPC_URL="https://mainnet.base.org" npx tsx scripts/testMandateContracts.ts
 */

import {
  healthCheck,
  readAgent,
  readMandate,
  readReputationSummary,
  readAllFeedback,
  getReviewerCount,
  getProvider,
  ESCROW_ADDRESS,
  MANDATE_STATUS_LABELS,
} from "../services/mandateContracts";

const REAL_MANDATE_ID = "0x7845ec5da0b2f971a953892119ab7ce0936960794f17b89a4781cf99d8ca9815";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail: string) {
  if (ok) { pass++; console.log(`  [PASS] ${name}: ${detail}`); }
  else { fail++; console.log(`  [FAIL] ${name}: ${detail}`); }
}

async function main() {
  console.log("=== Mandate Contracts — Comprehensive Test ===\n");

  // Health check
  console.log("--- Health Check ---\n");
  const health = await healthCheck();
  for (const [name, status] of Object.entries(health)) {
    check(name, status.includes("OK"), status);
  }

  await sleep(500);

  // Identity: read agent #1
  console.log("\n--- Identity: Read Agent #1 ---\n");
  const agent1 = await readAgent(1);
  check("readAgent(1)", agent1 !== null, agent1 ? `owner=${agent1.owner.slice(0,10)}... wallet=${agent1.wallet.slice(0,10)}...` : "null");

  await sleep(500);

  // Identity: non-existent agent
  console.log("\n--- Identity: Non-existent Agent ---\n");
  const agentBig = await readAgent(999999);
  check("readAgent(999999)", agentBig === null, agentBig === null ? "correctly null" : "unexpected value");

  await sleep(500);

  // Escrow: read real mandate
  console.log("\n--- Escrow: Read Real Mandate ---\n");
  const mandate = await readMandate(REAL_MANDATE_ID);
  if (mandate) {
    check("readMandate", true, `creator=${mandate.creator.slice(0,10)}... amount=${Number(mandate.amount)/1e18}ETH status=${MANDATE_STATUS_LABELS[mandate.status]}`);
  } else {
    check("readMandate", false, "could not read known mandate");
  }

  await sleep(500);

  // Escrow: non-existent mandate
  console.log("\n--- Escrow: Non-existent Mandate ---\n");
  const fakeMandate = await readMandate("0x0000000000000000000000000000000000000000000000000000000000000000");
  check("readMandate(zero)", fakeMandate === null, fakeMandate === null ? "correctly null" : "unexpected");

  await sleep(500);

  // Escrow: event scanning
  console.log("\n--- Escrow: Event Scanning ---\n");
  const provider = getProvider();
  if (provider) {
    try {
      const latest = await provider.getBlockNumber();
      const logs = await provider.getLogs({
        address: ESCROW_ADDRESS,
        fromBlock: latest - 10_000,
        toBlock: latest,
      });
      check("eventScan", logs.length >= 0, `${logs.length} events in last 10k blocks`);
    } catch (e) {
      check("eventScan", false, `RPC error: ${String(e).slice(0, 80)}`);
    }
  }

  await sleep(500);

  // Reputation: find an agent with reviews
  console.log("\n--- Reputation: Summary & Feedback ---\n");
  let foundReviews = false;
  for (const agentId of [1, 10, 50, 100, 500, 1000]) {
    await sleep(300);
    const count = await getReviewerCount(agentId);
    if (count > 0) {
      console.log(`  Agent #${agentId}: ${count} reviewers`);
      const summary = await readReputationSummary(agentId);
      if (summary) {
        check("getSummary", summary.count > 0, `count=${summary.count} value=${summary.summaryValue}`);
        const feedbacks = await readAllFeedback(agentId);
        check("readAllFeedback", feedbacks.length > 0, `${feedbacks.length} entries`);
        foundReviews = true;
        break;
      }
    } else {
      console.log(`  Agent #${agentId}: 0 reviewers`);
    }
  }
  if (!foundReviews) {
    console.log("  (No agents with reviews found in sampled IDs — not a failure, just no data yet)");
  }

  // Summary
  console.log(`\n=== Results: ${pass} passed, ${fail} failed ===`);
}

main().catch(console.error);
