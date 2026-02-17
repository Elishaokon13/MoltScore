/**
 * GET /api/leaderboard — unified leaderboard.
 * Prefers scored_agents_enhanced (richer data); falls back to scored_agents (basic).
 * Returns a consistent shape either way — enhanced fields are null when unavailable.
 */

import { pool } from "@/lib/db";
import { getTopScored, getLastUpdated } from "@/lib/cache";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));

    // Try enhanced table first
    const enhanced = await getEnhancedAgents(limit);

    if (enhanced.length > 0) {
      const lastUpdated = enhanced[0]?.metadata?.lastUpdated ?? new Date(0).toISOString();
      return NextResponse.json({
        success: true,
        count: enhanced.length,
        source: "enhanced",
        lastUpdated,
        agents: enhanced,
      });
    }

    // Fall back to basic scored_agents
    const [agents, lastUpdatedMs] = await Promise.all([getTopScored(limit), getLastUpdated()]);
    const lastUpdated =
      lastUpdatedMs > 0 ? new Date(lastUpdatedMs).toISOString() : new Date(0).toISOString();

    const basicAgents = agents.map((a, i) => ({
      rank: i + 1,
      username: a.username ?? "",
      wallet: a.wallet || null,
      score: a.score,
      tier: a.tier,
      completionRate: a.completionRate,
      tasksCompleted: a.tasksCompleted,
      tasksFailed: a.tasksFailed,
      disputes: a.disputes,
      slashes: a.slashes,
      ageDays: a.ageDays,
      components: null,
      stats: null,
      metadata: {
        hasOnchainData: a.tasksCompleted + a.tasksFailed > 0,
        hasDebateData: false,
        hasBankrData: false,
        dataCompleteness: a.tasksCompleted + a.tasksFailed > 0 ? 0.4 : 0,
        lastUpdated,
      },
    }));

    return NextResponse.json({
      success: true,
      count: basicAgents.length,
      source: "basic",
      lastUpdated,
      agents: basicAgents,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

async function getEnhancedAgents(limit: number) {
  try {
    const result = await pool.query(
      `SELECT
        sa.username,
        sa.wallet,
        sa.overall_score,
        sa.tier,
        sa.task_performance_score,
        sa.financial_reliability_score,
        sa.dispute_record_score,
        sa.ecosystem_participation_score,
        sa.intellectual_reputation_score,
        sa.has_onchain_data,
        sa.has_debate_data,
        sa.has_bankr_data,
        sa.data_completeness,
        sa.updated_at,
        -- Basic fields from scored_agents for backward compat
        bs.completion_rate,
        bs.tasks_completed,
        bs.tasks_failed,
        bs.disputes,
        bs.slashes,
        bs.age_days,
        -- MoltCourt joins
        mc.wins AS debate_wins,
        mc.losses AS debate_losses,
        mc.total_fights AS total_debates,
        mc.avg_jury_score,
        mc.leaderboard_rank AS debate_rank,
        -- Bankr joins
        bp.total_value_usd AS portfolio_value,
        bt.win_rate AS trading_win_rate
      FROM scored_agents_enhanced sa
      LEFT JOIN scored_agents bs ON sa.username = bs.username
      LEFT JOIN moltcourt_agents mc ON sa.username = mc.username
      LEFT JOIN bankr_portfolios bp ON sa.wallet = bp.wallet
      LEFT JOIN bankr_trading bt ON sa.wallet = bt.wallet
      ORDER BY sa.overall_score DESC NULLS LAST
      LIMIT $1`,
      [limit]
    );

    return (result.rows as Record<string, unknown>[]).map((row, index) => ({
      rank: index + 1,
      username: row.username as string,
      wallet: (row.wallet as string) || null,
      score: row.overall_score as number,
      tier: row.tier as string,
      completionRate: (row.completion_rate as number) ?? 0,
      tasksCompleted: (row.tasks_completed as number) ?? 0,
      tasksFailed: (row.tasks_failed as number) ?? 0,
      disputes: (row.disputes as number) ?? 0,
      slashes: (row.slashes as number) ?? 0,
      ageDays: (row.age_days as number) ?? 0,
      components: {
        taskPerformance: row.task_performance_score as number,
        financialReliability: row.financial_reliability_score as number,
        disputeRecord: row.dispute_record_score as number,
        ecosystemParticipation: row.ecosystem_participation_score as number,
        intellectualReputation: row.intellectual_reputation_score as number,
      },
      stats: {
        debateWins: row.debate_wins as number | null,
        debateLosses: row.debate_losses as number | null,
        totalDebates: row.total_debates as number | null,
        avgJuryScore: row.avg_jury_score as number | null,
        debateRank: row.debate_rank as number | null,
        portfolioValue: row.portfolio_value as number | null,
        tradingWinRate: row.trading_win_rate as number | null,
      },
      metadata: {
        hasOnchainData: row.has_onchain_data as boolean,
        hasDebateData: row.has_debate_data as boolean,
        hasBankrData: row.has_bankr_data as boolean,
        dataCompleteness: row.data_completeness as number,
        lastUpdated: row.updated_at
          ? new Date(row.updated_at as string).toISOString()
          : null,
      },
    }));
  } catch {
    // Table might not exist yet — that's fine, fall back to basic
    return [];
  }
}
