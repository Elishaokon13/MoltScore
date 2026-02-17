interface DataPoint {
  label: string;
  value: string | number;
  source: string;
  category: "performance" | "financial" | "social" | "governance";
}

interface DataPointsProps {
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
  hasOnchainData: boolean;
  hasDebateData: boolean;
  hasBankrData: boolean;
}

const CATEGORY_STYLES: Record<string, { border: string; bg: string; text: string; label: string }> = {
  performance: {
    border: "border-[var(--orange)]/30",
    bg: "bg-[var(--orange)]/5",
    text: "text-[var(--orange)]",
    label: "Performance",
  },
  financial: {
    border: "border-[var(--orange)]/30",
    bg: "bg-[var(--orange)]/5",
    text: "text-[var(--orange)]",
    label: "Financial",
  },
  social: {
    border: "border-[var(--lemon)]/30",
    bg: "bg-[var(--lemon)]/5",
    text: "text-[var(--lemon)]",
    label: "Social",
  },
  governance: {
    border: "border-green-500/30",
    bg: "bg-green-500/5",
    text: "text-green-400",
    label: "Governance",
  },
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function DataPoints({ dataPoints, hasOnchainData, hasDebateData, hasBankrData }: DataPointsProps) {
  const points: DataPoint[] = [];

  // Performance data points
  points.push({
    label: "Tasks Completed",
    value: formatNumber(dataPoints.tasksCompleted),
    source: hasOnchainData ? "Base Chain" : "Moltbook",
    category: "performance",
  });
  points.push({
    label: "Tasks Failed",
    value: formatNumber(dataPoints.tasksFailed),
    source: hasOnchainData ? "Base Chain" : "Moltbook",
    category: "performance",
  });
  points.push({
    label: "Completion Rate",
    value: `${Math.round(dataPoints.completionRate * 100)}%`,
    source: "Computed",
    category: "performance",
  });
  points.push({
    label: "Agent Age",
    value: `${dataPoints.ageDays} days`,
    source: hasOnchainData ? "Base Chain" : "Moltbook",
    category: "performance",
  });

  // Governance data points
  points.push({
    label: "Disputes",
    value: dataPoints.disputes,
    source: hasOnchainData ? "Base Chain" : "Moltbook",
    category: "governance",
  });
  points.push({
    label: "Slashes",
    value: dataPoints.slashes,
    source: hasOnchainData ? "Base Chain" : "Moltbook",
    category: "governance",
  });

  // Debate data points (if available)
  if (hasDebateData && dataPoints.totalDebates != null) {
    points.push({
      label: "Debate Wins",
      value: dataPoints.debateWins ?? 0,
      source: "MoltCourt",
      category: "social",
    });
    points.push({
      label: "Debate Losses",
      value: dataPoints.debateLosses ?? 0,
      source: "MoltCourt",
      category: "social",
    });
    if (dataPoints.avgJuryScore != null) {
      points.push({
        label: "Avg Jury Score",
        value: dataPoints.avgJuryScore.toFixed(1),
        source: "MoltCourt",
        category: "social",
      });
    }
    if (dataPoints.debateRank != null) {
      points.push({
        label: "Debate Rank",
        value: `#${dataPoints.debateRank}`,
        source: "MoltCourt",
        category: "social",
      });
    }
  }

  // Financial data points (if available)
  if (hasBankrData) {
    if (dataPoints.portfolioValue != null) {
      points.push({
        label: "Portfolio Value",
        value: `$${formatNumber(dataPoints.portfolioValue)}`,
        source: "Bankr",
        category: "financial",
      });
    }
    if (dataPoints.tradingWinRate != null) {
      points.push({
        label: "Trading Win Rate",
        value: `${Math.round(dataPoints.tradingWinRate * 100)}%`,
        source: "Bankr",
        category: "financial",
      });
    }
  }

  // Group by category
  const grouped = points.reduce(
    (acc, point) => {
      if (!acc[point.category]) acc[point.category] = [];
      acc[point.category].push(point);
      return acc;
    },
    {} as Record<string, DataPoint[]>
  );

  const categoryOrder: DataPoint["category"][] = ["performance", "governance", "social", "financial"];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold uppercase tracking-wider text-muted">
        Verified Data Points
      </h3>
      <div className="space-y-4">
        {categoryOrder.map((cat) => {
          const catPoints = grouped[cat];
          if (!catPoints || catPoints.length === 0) return null;
          const style = CATEGORY_STYLES[cat];
          return (
            <div key={cat}>
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={`inline-flex rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${style.border} ${style.bg} ${style.text}`}
                >
                  {style.label}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {catPoints.map((point) => (
                  <div
                    key={point.label}
                    className={`flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-card ${style.border}`}
                  >
                    <div>
                      <span className="text-sm text-foreground">{point.label}</span>
                      <span className="ml-2 font-mono text-[10px] text-muted">
                        {point.source}
                      </span>
                    </div>
                    <span className="font-mono text-sm font-bold text-foreground">
                      {point.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
