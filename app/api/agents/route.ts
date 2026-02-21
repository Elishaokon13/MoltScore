/**
 * GET /api/agents - paginated agent directory.
 * Live data from MoltLaunch API (reputation, market cap, volume, etc.) merged with
 * DB-only fields (score, tier, mandates). Supports ?search=, ?skill=, ?sort=, ?page=, ?limit=.
 */

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { parseAgentUri } from "@/lib/agentMetadata";
import { fetchAllAgents, type MoltAgent } from "@/lib/moltlaunchApi";

export const dynamic = "force-dynamic";

type MergedAgent = MoltAgent & {
  score: number | null;
  tier: string | null;
  _agent_uri: string | null;
};

function applySearch(agents: MergedAgent[], search: string): MergedAgent[] {
  if (!search) return agents;
  const s = search.toLowerCase();
  return agents.filter(
    (a) =>
      (a.name && a.name.toLowerCase().includes(s)) ||
      (a.description && a.description.toLowerCase().includes(s)) ||
      (a.agentIdBigInt === s) ||
      (a.agentWallet && a.agentWallet.toLowerCase().includes(s)) ||
      (a.symbol && a.symbol.toLowerCase().includes(s))
  );
}

function applySkill(agents: MergedAgent[], skill: string): MergedAgent[] {
  if (!skill || skill === "all") return agents;
  const s = skill.toLowerCase();
  return agents.filter(
    (a) => a.skills?.some((sk) => sk.toLowerCase().includes(s))
  );
}

function sortAgents(agents: MergedAgent[], sort: string): MergedAgent[] {
  const arr = [...agents];
  switch (sort) {
    case "mcap":
      arr.sort(
        (a, b) =>
          (b.marketCapUSD ?? 0) - (a.marketCapUSD ?? 0) ||
          parseInt(a.agentIdBigInt, 10) - parseInt(b.agentIdBigInt, 10)
      );
      break;
    case "score":
      arr.sort(
        (a, b) =>
          (b.score ?? 0) - (a.score ?? 0) ||
          parseInt(a.agentIdBigInt, 10) - parseInt(b.agentIdBigInt, 10)
      );
      break;
    case "reputation":
      arr.sort(
        (a, b) =>
          (b.reputation?.summaryValue ?? 0) - (a.reputation?.summaryValue ?? 0) ||
          (b.reputation?.count ?? 0) - (a.reputation?.count ?? 0) ||
          parseInt(a.agentIdBigInt, 10) - parseInt(b.agentIdBigInt, 10)
      );
      break;
    case "recent":
      arr.sort(
        (a, b) =>
          (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0) ||
          parseInt(b.agentIdBigInt, 10) - parseInt(a.agentIdBigInt, 10)
      );
      break;
    case "id":
      arr.sort(
        (a, b) =>
          parseInt(a.agentIdBigInt, 10) - parseInt(b.agentIdBigInt, 10)
      );
      break;
    default:
      // "named" - featured first, then mcap
      arr.sort((a, b) => {
        const scoreA =
          (a.marketCapUSD && a.marketCapUSD > 0 && a.description ? 1 : 0) +
          (a.description && a.image ? 1 : 0) * 2 +
          (a.description ? 1 : 0) * 4 +
          (a.name ? 1 : 0) * 8;
        const scoreB =
          (b.marketCapUSD && b.marketCapUSD > 0 && b.description ? 1 : 0) +
          (b.description && b.image ? 1 : 0) * 2 +
          (b.description ? 1 : 0) * 4 +
          (b.name ? 1 : 0) * 8;
        if (scoreB !== scoreA) return scoreB - scoreA;
        return (b.marketCapUSD ?? 0) - (a.marketCapUSD ?? 0) || parseInt(a.agentIdBigInt, 10) - parseInt(b.agentIdBigInt, 10);
      });
      break;
  }
  return arr;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const search = url.searchParams.get("search")?.trim() ?? "";
  const skill = url.searchParams.get("skill")?.trim() ?? "";
  const sort = url.searchParams.get("sort") ?? "named";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)));
  const offset = (page - 1) * limit;

  try {
    const apiAgents = await fetchAllAgents();
    const agentIds = apiAgents
      .map((a) => parseInt(a.agentIdBigInt, 10))
      .filter((id) => !isNaN(id));
    const dbRows = await pool.query<{
      agent_id: number;
      score: number | null;
      tier: string | null;
      agent_uri: string | null;
    }>(
      agentIds.length > 0
        ? `SELECT agent_id, score, tier, agent_uri FROM mandate_agents WHERE agent_id = ANY($1::int[])`
        : `SELECT agent_id, score, tier, agent_uri FROM mandate_agents WHERE 1=0`,
      agentIds.length > 0 ? [agentIds] : []
    );

    const dbByAgentId = new Map(
      dbRows.rows.map((r) => [
        r.agent_id,
        { score: r.score, tier: r.tier, agent_uri: r.agent_uri },
      ])
    );

    let merged: MergedAgent[] = apiAgents.map((a) => {
      const agentId = parseInt(a.agentIdBigInt, 10);
      const db = dbByAgentId.get(agentId);
      return {
        ...a,
        score: db?.score ?? null,
        tier: db?.tier ?? null,
        _agent_uri: db?.agent_uri ?? a.agentURI ?? null,
      };
    });

    merged = applySearch(merged, search);
    merged = applySkill(merged, skill);
    const total = merged.length;
    merged = sortAgents(merged, sort);
    const pageAgents = merged.slice(offset, offset + limit);

    const agents = pageAgents.map((a) => {
      let displayName: string | null = a.name ?? null;
      let desc: string | null = a.description ?? null;
      let image: string | null = a.image ?? null;
      let skills = a.skills ?? [];
      if ((!displayName || !desc || !image) && a._agent_uri) {
        const meta = parseAgentUri(a._agent_uri);
        displayName = displayName || meta.name || null;
        desc = desc || meta.description || null;
        image = image || meta.image || null;
        if (skills.length === 0) skills = meta.skills;
      }
      return {
        agentId: parseInt(a.agentIdBigInt, 10),
        name: displayName || `Agent #${a.agentIdBigInt}`,
        description: desc ?? undefined,
        image: image ?? undefined,
        skills,
        wallet: a.agentWallet,
        owner: a.owner,
        score: a.score,
        tier: a.tier,
        symbol: a.symbol ?? undefined,
        marketCap: a.marketCapUSD ?? 0,
        volume24h: a.volume24hUSD ?? 0,
        priceChange24h: a.priceChange24h ?? 0,
        liquidity: a.liquidityUSD ?? 0,
        holders: a.holders ?? 0,
        flaunchToken: a.flaunchToken ?? undefined,
        flaunchUrl: a.flaunchUrl ?? undefined,
        twitter: a.twitter ?? undefined,
        xVerified: a.xVerified ?? false,
        hasProfile: a.hasProfile ?? false,
        repCount: a.reputation?.count ?? 0,
        repValue: a.reputation?.summaryValue ?? 0,
        gigCount: a.gigCount ?? 0,
        completedTasks: a.completedTasks ?? 0,
        activeTasks: a.activeTasks ?? 0,
      };
    });

    return NextResponse.json({
      success: true,
      agents,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (e) {
    console.error("[API /agents]", e);
    return NextResponse.json(
      { success: false, error: "Failed to load agents" },
      { status: 500 }
    );
  }
}
