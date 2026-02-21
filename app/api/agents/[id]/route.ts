/**
 * GET /api/agents/:id - Single agent detail.
 * Live data from MoltLaunch API (reputation, market cap, volume, etc.) merged with
 * DB-only fields (score, tier, mandates, feedback). Falls back to DB if API fails.
 */

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { parseAgentUri } from "@/lib/agentMetadata";
import { fetchAgentById } from "@/lib/moltlaunchApi";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const agentId = parseInt(id, 10);

  if (isNaN(agentId)) {
    return NextResponse.json({ error: "Invalid agent ID" }, { status: 400 });
  }

  try {
    const [apiAgent, dbRes] = await Promise.all([
      fetchAgentById(agentId),
      pool.query(
        `SELECT agent_id, owner_address, wallet_address, agent_uri,
                name, description, image_url, skills,
                feedback_count, avg_feedback_value, unique_reviewers,
                score, tier, mandates_as_worker, mandates_as_creator, mandates_completed,
                symbol, market_cap_usd, volume_24h_usd, price_change_24h,
                liquidity_usd, holders, flaunch_token, flaunch_url,
                twitter, x_verified, has_profile, endpoint, price_wei,
                gig_count, completed_tasks, active_tasks, last_active_at,
                rep_summary_value, rep_count, discovered_at
         FROM mandate_agents
         WHERE agent_id = $1
         LIMIT 1`,
        [agentId]
      ),
    ]);

    const dbRow = dbRes.rows[0];
    if (!apiAgent && !dbRow) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const row = dbRow;
    const a = apiAgent;

    const displayName =
      a?.name ?? row?.name ??
      (row?.agent_uri ? parseAgentUri(row.agent_uri).name : null);
    const desc =
      a?.description ?? row?.description ??
      (row?.agent_uri ? parseAgentUri(row.agent_uri).description : null);
    const image =
      a?.image ?? row?.image_url ??
      (row?.agent_uri ? parseAgentUri(row.agent_uri).image : null);
    const skills =
      (a?.skills?.length ? a.skills : row?.skills) ??
      (row?.agent_uri ? parseAgentUri(row.agent_uri).skills : []) ??
      [];

    return NextResponse.json({
      success: true,
      agent: {
        agentId,
        name: displayName || `Agent #${agentId}`,
        description: desc,
        image: image,
        skills: skills,
        wallet: a?.agentWallet ?? row?.wallet_address,
        owner: a?.owner ?? row?.owner_address,
        agentUri: a?.agentURI ?? row?.agent_uri,
        score: row?.score ?? null,
        tier: row?.tier ?? null,
        symbol: a?.symbol ?? row?.symbol,
        marketCap: a?.marketCapUSD ?? parseFloat(row?.market_cap_usd) ?? 0,
        volume24h: a?.volume24hUSD ?? parseFloat(row?.volume_24h_usd) ?? 0,
        priceChange24h: a?.priceChange24h ?? parseFloat(row?.price_change_24h) ?? 0,
        liquidity: a?.liquidityUSD ?? parseFloat(row?.liquidity_usd) ?? 0,
        holders: a?.holders ?? row?.holders ?? 0,
        flaunchToken: a?.flaunchToken ?? row?.flaunch_token,
        flaunchUrl: a?.flaunchUrl ?? row?.flaunch_url,
        twitter: a?.twitter ?? row?.twitter,
        xVerified: a?.xVerified ?? row?.x_verified ?? false,
        hasProfile: a?.hasProfile ?? row?.has_profile ?? false,
        endpoint: a?.endpoint ?? row?.endpoint,
        priceWei: a?.priceWei ?? row?.price_wei,
        gigCount: a?.gigCount ?? row?.gig_count ?? 0,
        completedTasks: a?.completedTasks ?? row?.completed_tasks ?? 0,
        activeTasks: a?.activeTasks ?? row?.active_tasks ?? 0,
        lastActiveAt: a?.lastActiveAt != null
          ? new Date(a.lastActiveAt).toISOString()
          : row?.last_active_at,
        repValue: a?.reputation?.summaryValue ?? row?.rep_summary_value ?? 0,
        repCount: a?.reputation?.count ?? row?.rep_count ?? 0,
        mandatesAsWorker: row?.mandates_as_worker ?? 0,
        mandatesAsCreator: row?.mandates_as_creator ?? 0,
        mandatesCompleted: row?.mandates_completed ?? 0,
        feedbackCount: row?.feedback_count ?? 0,
        avgFeedbackValue: parseFloat(row?.avg_feedback_value) ?? 0,
        uniqueReviewers: row?.unique_reviewers ?? 0,
        discoveredAt: row?.discovered_at,
      },
    });
  } catch (e) {
    console.error("[API /agents/:id]", e);
    return NextResponse.json(
      { success: false, error: "Failed to load agent" },
      { status: 500 }
    );
  }
}
