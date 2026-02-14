/**
 * Bankr integration for financial metrics. Requires BANKR_API_KEY.
 * Graceful fallback when no key or API errors.
 */

const BANKR_API = "https://api.bankr.bot";
const LOG = "[Bankr]";

export interface BankrMetrics {
  wallet: string;
  portfolio: {
    totalValueUSD: number;
    diversificationScore: number;
    stablecoinRatio: number;
    chainCount: number;
  };
  trading: {
    totalTrades: number;
    totalVolumeUSD: number;
    winRate: number;
    avgHoldTimeHours: number;
  };
  risk: {
    hasUsedStopLoss: boolean;
    maxLeverageUsed: number;
    liquidations: number;
    riskScore: number;
  };
  defi: {
    liquidityProvided: boolean;
    totalLPValueUSD: number;
    automatedStrategies: number;
  };
}

async function submitBankrJob(apiKey: string, prompt: string): Promise<string | null> {
  try {
    const res = await fetch(`${BANKR_API}/v1/jobs`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { jobId?: string };
    return data.jobId ?? null;
  } catch (e) {
    console.warn(LOG, "submitBankrJob failed", { error: String(e) });
    return null;
  }
}

async function pollBankrJob(apiKey: string, jobId: string, maxAttempts = 30): Promise<unknown> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    try {
      const res = await fetch(`${BANKR_API}/v1/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return null;
      const status = (await res.json()) as { state?: string; result?: unknown; error?: string };
      if (status.state === "completed") return status.result ?? null;
      if (status.state === "failed") {
        console.warn(LOG, "job failed", { jobId, error: status.error });
        return null;
      }
    } catch (e) {
      console.warn(LOG, "pollBankrJob error", { attempt: i + 1, error: String(e) });
    }
  }
  console.warn(LOG, "pollBankrJob timeout", { jobId });
  return null;
}

function parseBankrMetrics(wallet: string, _data: unknown): BankrMetrics {
  const data = _data as Record<string, unknown> | null;
  if (!data || typeof data !== "object") {
    return defaultBankrMetrics(wallet);
  }
  const portfolio = (data.portfolio as Record<string, unknown>) ?? {};
  const trading = (data.trading as Record<string, unknown>) ?? {};
  const risk = (data.risk as Record<string, unknown>) ?? {};
  const defi = (data.defi as Record<string, unknown>) ?? {};
  return {
    wallet,
    portfolio: {
      totalValueUSD: Number(portfolio.totalValueUSD ?? portfolio.total_value_usd ?? 0),
      diversificationScore: Number(portfolio.diversificationScore ?? portfolio.diversification_score ?? 0),
      stablecoinRatio: Number(portfolio.stablecoinRatio ?? portfolio.stablecoin_ratio ?? 0),
      chainCount: Number(portfolio.chainCount ?? portfolio.chain_count ?? 0),
    },
    trading: {
      totalTrades: Number(trading.totalTrades ?? trading.total_trades ?? 0),
      totalVolumeUSD: Number(trading.totalVolumeUSD ?? trading.total_volume_usd ?? 0),
      winRate: Number(trading.winRate ?? trading.win_rate ?? 0),
      avgHoldTimeHours: Number(trading.avgHoldTimeHours ?? trading.avg_hold_time_hours ?? 0),
    },
    risk: {
      hasUsedStopLoss: Boolean(risk.hasUsedStopLoss ?? risk.has_used_stop_loss),
      maxLeverageUsed: Number(risk.maxLeverageUsed ?? risk.max_leverage_used ?? 0),
      liquidations: Number(risk.liquidations ?? 0),
      riskScore: Number(risk.riskScore ?? risk.risk_score ?? 0.5),
    },
    defi: {
      liquidityProvided: Boolean(defi.liquidityProvided ?? defi.liquidity_provided),
      totalLPValueUSD: Number(defi.totalLPValueUSD ?? defi.total_lp_value_usd ?? 0),
      automatedStrategies: Array.isArray(defi.automatedStrategies)
        ? (defi.automatedStrategies as unknown[]).length
        : typeof defi.automated_strategies === "object" && defi.automated_strategies !== null
          ? Object.keys(defi.automated_strategies as object).length
          : 0,
    },
  };
}

function defaultBankrMetrics(wallet: string): BankrMetrics {
  return {
    wallet,
    portfolio: { totalValueUSD: 0, diversificationScore: 0, stablecoinRatio: 0, chainCount: 0 },
    trading: { totalTrades: 0, totalVolumeUSD: 0, winRate: 0, avgHoldTimeHours: 0 },
    risk: { hasUsedStopLoss: false, maxLeverageUsed: 0, liquidations: 0, riskScore: 0.5 },
    defi: { liquidityProvided: false, totalLPValueUSD: 0, automatedStrategies: 0 },
  };
}

/**
 * Fetch Bankr metrics for a wallet. Returns null if no API key, API error, or timeout.
 */
export async function getBankrMetrics(
  apiKey: string | undefined,
  wallet: string
): Promise<BankrMetrics | null> {
  if (!apiKey?.trim()) return null;
  if (!wallet?.trim()) return null;
  try {
    const jobId = await submitBankrJob(
      apiKey,
      `Show complete portfolio for ${wallet} with USD values`
    );
    if (!jobId) return null;
    const result = await pollBankrJob(apiKey, jobId);
    return parseBankrMetrics(wallet, result);
  } catch (e) {
    console.warn(LOG, "getBankrMetrics failed", { wallet: wallet.slice(0, 10) + "...", error: String(e) });
    return null;
  }
}

/**
 * Financial reliability score 0–1 (max 300 points when scaled).
 */
export function calculateFinancialScore(metrics: BankrMetrics): number {
  const portfolioScore =
    Math.min(Math.log10(Math.max(metrics.portfolio.totalValueUSD, 1)) / 5, 1) * 0.4 +
    metrics.portfolio.diversificationScore * 0.3;
  const tradingScore =
    metrics.trading.winRate * 0.4 +
    Math.min(Math.log10(Math.max(metrics.trading.totalVolumeUSD, 1)) / 5, 1) * 0.3;
  const riskScore = metrics.risk.hasUsedStopLoss ? 0.7 : 0.3;
  const liquidationPenalty = metrics.risk.liquidations * 0.2;
  const finalRiskScore = Math.max(0, riskScore - liquidationPenalty);
  const defiScore =
    (metrics.defi.liquidityProvided ? 0.3 : 0) + Math.min(metrics.defi.automatedStrategies / 10, 0.3);
  return (
    portfolioScore * 0.3 +
    tradingScore * 0.25 +
    finalRiskScore * 0.25 +
    defiScore * 0.2
  );
}
