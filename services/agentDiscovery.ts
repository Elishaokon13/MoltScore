/**
 * Agent discovery: orchestrate crawl and return discovered agents (with wallets when available).
 */

import { discoverAgents as crawlDiscover } from "./moltbookCrawler";
import { setDiscovered } from "@/lib/cache";

export async function discoverAgents(limit = 50) {
  const agents = await crawlDiscover(limit);
  await setDiscovered(agents);
  return agents;
}
