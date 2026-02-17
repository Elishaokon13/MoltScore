/**
 * GET /api/agents/:id - Single agent detail from mandate_agents.
 * Returns full agent data including cached metadata + Moltlaunch enrichment.
 */

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { parseAgentUri } from "@/lib/agentMetadata";

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
    const res = await pool.query(
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
    );

    if (res.rows.length === 0) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const row = res.rows[0];

    let displayName = row.name;
    let desc = row.description;
    let image = row.image_url;
    let skills = row.skills ?? [];

    if (!displayName && row.agent_uri) {
      const meta = parseAgentUri(row.agent_uri);
      displayName = meta.name;
      desc = desc || meta.description;
      image = image || meta.image;
      if (skills.length === 0) skills = meta.skills;
    }

    return NextResponse.json({
      success: true,
      agent: {
        agentId: row.agent_id,
        name: displayName || `Agent #${row.agent_id}`,
        description: desc,
        image,
        skills,
        wallet: row.wallet_address,
        owner: row.owner_address,
        agentUri: row.agent_uri,
        score: row.score,
        tier: row.tier,
        symbol: row.symbol,
        marketCap: parseFloat(row.market_cap_usd) || 0,
        volume24h: parseFloat(row.volume_24h_usd) || 0,
        priceChange24h: parseFloat(row.price_change_24h) || 0,
        liquidity: parseFloat(row.liquidity_usd) || 0,
        holders: row.holders || 0,
        flaunchToken: row.flaunch_token,
        flaunchUrl: row.flaunch_url,
        twitter: row.twitter,
        xVerified: row.x_verified || false,
        hasProfile: row.has_profile || false,
        endpoint: row.endpoint,
        priceWei: row.price_wei,
        gigCount: row.gig_count || 0,
        completedTasks: row.completed_tasks || 0,
        activeTasks: row.active_tasks || 0,
        lastActiveAt: row.last_active_at,
        repValue: row.rep_summary_value || 0,
        repCount: row.rep_count || 0,
        mandatesAsWorker: row.mandates_as_worker || 0,
        mandatesAsCreator: row.mandates_as_creator || 0,
        mandatesCompleted: row.mandates_completed || 0,
        feedbackCount: row.feedback_count || 0,
        avgFeedbackValue: parseFloat(row.avg_feedback_value) || 0,
        uniqueReviewers: row.unique_reviewers || 0,
        discoveredAt: row.discovered_at,
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
