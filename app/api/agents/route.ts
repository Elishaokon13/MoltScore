/**
 * GET /api/agents - paginated agent directory from mandate_agents.
 * Uses cached metadata + Moltlaunch-enriched data (market cap, token, rep).
 * Supports ?search=, ?skill=, ?sort=, ?page=, ?limit=.
 */

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { parseAgentUri } from "@/lib/agentMetadata";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const search = url.searchParams.get("search")?.trim().toLowerCase() ?? "";
  const skill = url.searchParams.get("skill")?.trim().toLowerCase() ?? "";
  const sort = url.searchParams.get("sort") ?? "named";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)));
  const offset = (page - 1) * limit;

  try {
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIdx = 1;

    if (search) {
      conditions.push(
        `(LOWER(name) LIKE $${paramIdx} OR LOWER(description) LIKE $${paramIdx} OR agent_id::text = $${paramIdx + 1} OR LOWER(wallet_address) LIKE $${paramIdx} OR LOWER(symbol) LIKE $${paramIdx})`
      );
      params.push(`%${search}%`, search);
      paramIdx += 2;
    }

    if (skill && skill !== "all") {
      conditions.push(`EXISTS (SELECT 1 FROM unnest(skills) s WHERE LOWER(s) LIKE $${paramIdx})`);
      params.push(`%${skill}%`);
      paramIdx += 1;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Sort options
    let orderBy: string;
    switch (sort) {
      case "mcap":
        orderBy = "market_cap_usd DESC NULLS LAST, agent_id ASC";
        break;
      case "score":
        orderBy = "score DESC NULLS LAST, agent_id ASC";
        break;
      case "reputation":
        orderBy = "rep_summary_value DESC NULLS LAST, rep_count DESC, agent_id ASC";
        break;
      case "recent":
        orderBy = "last_active_at DESC NULLS LAST, agent_id DESC";
        break;
      case "id":
        orderBy = "agent_id ASC";
        break;
      default: // "named" - featured: agents with rich profiles first, then by market cap
        orderBy = `
          CASE
            WHEN market_cap_usd > 0 AND description IS NOT NULL THEN 0
            WHEN description IS NOT NULL AND image_url IS NOT NULL THEN 1
            WHEN description IS NOT NULL THEN 2
            WHEN name IS NOT NULL THEN 3
            ELSE 4
          END,
          market_cap_usd DESC NULLS LAST,
          agent_id ASC`;
        break;
    }

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total FROM mandate_agents ${whereClause}`,
      params
    );
    const total = countRes.rows[0]?.total ?? 0;

    const res = await pool.query(
      `SELECT agent_id, owner_address, wallet_address, agent_uri,
              name, description, image_url, skills,
              feedback_count, avg_feedback_value, unique_reviewers,
              score, tier, mandates_as_worker, mandates_as_creator, mandates_completed,
              symbol, market_cap_usd, volume_24h_usd, price_change_24h,
              liquidity_usd, holders, flaunch_token, flaunch_url,
              twitter, x_verified, has_profile, gig_count,
              completed_tasks, active_tasks, last_active_at,
              rep_summary_value, rep_count
       FROM mandate_agents
       ${whereClause}
       ORDER BY ${orderBy}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    const agents = res.rows.map((row) => {
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

      return {
        agentId: row.agent_id,
        name: displayName || `Agent #${row.agent_id}`,
        description: desc,
        image: image,
        skills: skills,
        wallet: row.wallet_address,
        owner: row.owner_address,
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
        repCount: row.rep_count || 0,
        repValue: row.rep_summary_value || 0,
        gigCount: row.gig_count || 0,
        completedTasks: row.completed_tasks || 0,
        activeTasks: row.active_tasks || 0,
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
