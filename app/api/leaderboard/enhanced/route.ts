/**
 * GET /api/leaderboard/enhanced — top agents from scored_agents_enhanced with MoltCourt + Bankr joins.
 */

import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));

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
        mc.wins AS debate_wins,
        mc.losses AS debate_losses,
        mc.total_fights AS total_debates,
        mc.avg_jury_score,
        mc.leaderboard_rank AS debate_rank,
        bp.total_value_usd AS portfolio_value,
        bt.win_rate AS trading_win_rate,
        sa.updated_at
      FROM scored_agents_enhanced sa
      LEFT JOIN moltcourt_agents mc ON sa.username = mc.username
      LEFT JOIN bankr_portfolios bp ON sa.wallet = bp.wallet
      LEFT JOIN bankr_trading bt ON sa.wallet = bt.wallet
      ORDER BY sa.overall_score DESC NULLS LAST
      LIMIT $1`,
      [limit]
    );

    const agents = (result.rows as Record<string, unknown>[]).map((row, index) => ({
      rank: index + 1,
      username: row.username,
      wallet: row.wallet,
      score: row.overall_score,
      tier: row.tier,
      components: {
        taskPerformance: row.task_performance_score,
        financialReliability: row.financial_reliability_score,
        disputeRecord: row.dispute_record_score,
        ecosystemParticipation: row.ecosystem_participation_score,
        intellectualReputation: row.intellectual_reputation_score,
      },
      stats: {
        debateWins: row.debate_wins,
        debateLosses: row.debate_losses,
        totalDebates: row.total_debates,
        avgJuryScore: row.avg_jury_score,
        debateRank: row.debate_rank,
        portfolioValue: row.portfolio_value,
        tradingWinRate: row.trading_win_rate,
      },
      metadata: {
        hasOnchainData: row.has_onchain_data,
        hasDebateData: row.has_debate_data,
        hasBankrData: row.has_bankr_data,
        dataCompleteness: row.data_completeness,
        lastUpdated: row.updated_at,
      },
    }));

    return NextResponse.json({ success: true, agents });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
