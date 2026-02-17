/**
 * GET /api/agent/:username — Full reputation profile for a single agent.
 * Returns score, tier, component breakdown, data points, and metadata.
 * This is the core endpoint of the reputation layer.
 */

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

interface AgentProfile {
  username: string;
  wallet: string | null;
  score: number;
  tier: string;
  components: {
    taskPerformance: { score: number; max: number; signal: string };
    financialReliability: { score: number; max: number; signal: string };
    disputeRecord: { score: number; max: number; signal: string };
    ecosystemParticipation: { score: number; max: number; signal: string };
    intellectualReputation: { score: number; max: number; signal: string };
  } | null;
  dataPoints: {
    tasksCompleted: number;
    tasksFailed: number;
    completionRate: number;
    disputes: number;
    slashes: number;
    ageDays: number;
    debateWins: number | null;
    debateLosses: number | null;
    totalDebates: number | null;
    avgJuryScore: number | null;
    debateRank: number | null;
    portfolioValue: number | null;
    tradingWinRate: number | null;
  };
  metadata: {
    source: "enhanced" | "basic";
    hasOnchainData: boolean;
    hasDebateData: boolean;
    hasBankrData: boolean;
    dataCompleteness: number;
    lastUpdated: string | null;
    scoredAt: string | null;
  };
}

function signalStrength(score: number, max: number): string {
  const ratio = max > 0 ? score / max : 0;
  if (ratio >= 0.7) return "strong";
  if (ratio >= 0.35) return "medium";
  return "weak";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  if (!username || username.length < 1 || username.length > 100) {
    return NextResponse.json(
      { success: false, error: "Invalid username" },
      { status: 400 }
    );
  }

  const normalizedUsername = username.toLowerCase().trim();

  try {
    // Try enhanced data first
    const enhanced = await getEnhancedProfile(normalizedUsername);
    if (enhanced) {
      return NextResponse.json({ success: true, agent: enhanced });
    }

    // Fall back to basic scored_agents
    const basic = await getBasicProfile(normalizedUsername);
    if (basic) {
      return NextResponse.json({ success: true, agent: basic });
    }

    // Check if agent is discovered but not yet scored
    const discovered = await getDiscoveredAgent(normalizedUsername);
    if (discovered) {
      return NextResponse.json({
        success: true,
        agent: {
          username: discovered.username,
          wallet: discovered.wallet,
          score: null,
          tier: null,
          components: null,
          dataPoints: null,
          metadata: {
            source: "discovered",
            hasOnchainData: false,
            hasDebateData: false,
            hasBankrData: false,
            dataCompleteness: 0,
            lastUpdated: discovered.lastSeenAt,
            scoredAt: null,
          },
        },
      });
    }

    return NextResponse.json(
      { success: false, error: "Agent not found" },
      { status: 404 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

async function getEnhancedProfile(username: string): Promise<AgentProfile | null> {
  try {
    const result = await pool.query(
      `SELECT
        sa.username, sa.wallet, sa.overall_score, sa.tier,
        sa.task_performance_score, sa.financial_reliability_score,
        sa.dispute_record_score, sa.ecosystem_participation_score,
        sa.intellectual_reputation_score,
        sa.has_onchain_data, sa.has_debate_data, sa.has_bankr_data,
        sa.data_completeness, sa.scored_at, sa.updated_at,
        bs.completion_rate, bs.tasks_completed, bs.tasks_failed,
        bs.disputes, bs.slashes, bs.age_days,
        mc.wins AS debate_wins, mc.losses AS debate_losses,
        mc.total_fights AS total_debates, mc.avg_jury_score,
        mc.leaderboard_rank AS debate_rank,
        bp.total_value_usd AS portfolio_value,
        bt.win_rate AS trading_win_rate
      FROM scored_agents_enhanced sa
      LEFT JOIN scored_agents bs ON sa.username = bs.username
      LEFT JOIN moltcourt_agents mc ON sa.username = mc.username
      LEFT JOIN bankr_portfolios bp ON sa.wallet = bp.wallet
      LEFT JOIN bankr_trading bt ON sa.wallet = bt.wallet
      WHERE LOWER(sa.username) = $1
      LIMIT 1`,
      [username]
    );

    if (result.rows.length === 0) return null;
    const r = result.rows[0] as Record<string, unknown>;

    const taskPerf = (r.task_performance_score as number) ?? 0;
    const financial = (r.financial_reliability_score as number) ?? 0;
    const dispute = (r.dispute_record_score as number) ?? 0;
    const ecosystem = (r.ecosystem_participation_score as number) ?? 0;
    const intellectual = (r.intellectual_reputation_score as number) ?? 0;

    return {
      username: r.username as string,
      wallet: (r.wallet as string) || null,
      score: r.overall_score as number,
      tier: r.tier as string,
      components: {
        taskPerformance: { score: taskPerf, max: 200, signal: signalStrength(taskPerf, 200) },
        financialReliability: { score: financial, max: 300, signal: signalStrength(financial, 300) },
        disputeRecord: { score: dispute, max: 150, signal: signalStrength(dispute, 150) },
        ecosystemParticipation: { score: ecosystem, max: 200, signal: signalStrength(ecosystem, 200) },
        intellectualReputation: { score: intellectual, max: 150, signal: signalStrength(intellectual, 150) },
      },
      dataPoints: {
        tasksCompleted: (r.tasks_completed as number) ?? 0,
        tasksFailed: (r.tasks_failed as number) ?? 0,
        completionRate: (r.completion_rate as number) ?? 0,
        disputes: (r.disputes as number) ?? 0,
        slashes: (r.slashes as number) ?? 0,
        ageDays: (r.age_days as number) ?? 0,
        debateWins: (r.debate_wins as number) ?? null,
        debateLosses: (r.debate_losses as number) ?? null,
        totalDebates: (r.total_debates as number) ?? null,
        avgJuryScore: (r.avg_jury_score as number) ?? null,
        debateRank: (r.debate_rank as number) ?? null,
        portfolioValue: (r.portfolio_value as number) ?? null,
        tradingWinRate: (r.trading_win_rate as number) ?? null,
      },
      metadata: {
        source: "enhanced",
        hasOnchainData: r.has_onchain_data as boolean,
        hasDebateData: r.has_debate_data as boolean,
        hasBankrData: r.has_bankr_data as boolean,
        dataCompleteness: (r.data_completeness as number) ?? 0,
        lastUpdated: r.updated_at ? new Date(r.updated_at as string).toISOString() : null,
        scoredAt: r.scored_at ? new Date(r.scored_at as string).toISOString() : null,
      },
    };
  } catch {
    return null;
  }
}

async function getBasicProfile(username: string): Promise<AgentProfile | null> {
  const result = await pool.query(
    `SELECT username, wallet, score, tier, completion_rate,
            tasks_completed, tasks_failed, disputes, slashes, age_days, updated_at
     FROM scored_agents
     WHERE LOWER(username) = $1
     LIMIT 1`,
    [username]
  );

  if (result.rows.length === 0) return null;
  const r = result.rows[0] as Record<string, unknown>;

  return {
    username: r.username as string,
    wallet: (r.wallet as string) || null,
    score: (r.score as number) ?? 0,
    tier: (r.tier as string) ?? "",
    components: null,
    dataPoints: {
      tasksCompleted: (r.tasks_completed as number) ?? 0,
      tasksFailed: (r.tasks_failed as number) ?? 0,
      completionRate: (r.completion_rate as number) ?? 0,
      disputes: (r.disputes as number) ?? 0,
      slashes: (r.slashes as number) ?? 0,
      ageDays: (r.age_days as number) ?? 0,
      debateWins: null,
      debateLosses: null,
      totalDebates: null,
      avgJuryScore: null,
      debateRank: null,
      portfolioValue: null,
      tradingWinRate: null,
    },
    metadata: {
      source: "basic",
      hasOnchainData: ((r.tasks_completed as number) ?? 0) + ((r.tasks_failed as number) ?? 0) > 0,
      hasDebateData: false,
      hasBankrData: false,
      dataCompleteness: ((r.tasks_completed as number) ?? 0) + ((r.tasks_failed as number) ?? 0) > 0 ? 0.4 : 0,
      lastUpdated: r.updated_at ? new Date(r.updated_at as string).toISOString() : null,
      scoredAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : null,
    },
  };
}

async function getDiscoveredAgent(
  username: string
): Promise<{ username: string; wallet: string | null; lastSeenAt: string | null } | null> {
  const result = await pool.query(
    `SELECT username, wallet, last_seen_at FROM discovered_agents WHERE LOWER(username) = $1 LIMIT 1`,
    [username]
  );

  if (result.rows.length === 0) return null;
  const r = result.rows[0] as Record<string, unknown>;

  return {
    username: r.username as string,
    wallet: (r.wallet as string) || null,
    lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at as string).toISOString() : null,
  };
}
