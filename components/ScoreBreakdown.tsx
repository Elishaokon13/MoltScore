"use client";

import { useEffect, useState } from "react";

interface ScoreComponent {
  label: string;
  score: number;
  max: number;
  signal: string;
  icon: React.ReactNode;
  color: string;
}

interface ScoreBreakdownProps {
  components: {
    taskPerformance: { score: number; max: number; signal: string };
    financialReliability: { score: number; max: number; signal: string };
    disputeRecord: { score: number; max: number; signal: string };
    ecosystemParticipation: { score: number; max: number; signal: string };
    intellectualReputation: { score: number; max: number; signal: string };
  };
}

function SignalBadge({ signal }: { signal: string }) {
  const styles: Record<string, string> = {
    strong:
      "border-green-500/40 bg-green-500/10 text-green-400",
    medium:
      "border-[var(--lemon)]/40 bg-[var(--lemon)]/10 text-[var(--lemon)]",
    weak: "border-red-400/40 bg-red-400/10 text-red-400",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${styles[signal] ?? styles.weak}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          signal === "strong"
            ? "bg-green-400"
            : signal === "medium"
              ? "bg-lemon"
              : "bg-red-400"
        }`}
      />
      {signal}
    </span>
  );
}

function AnimatedBar({ percent, color, delay }: { percent: number; color: string; delay: number }) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => setWidth(percent), delay);
    return () => clearTimeout(timer);
  }, [percent, delay]);

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-border/50">
      <div
        className="h-full rounded-full transition-all duration-1000 ease-out"
        style={{
          width: `${width}%`,
          background: color,
        }}
      />
    </div>
  );
}

export function ScoreBreakdown({ components }: ScoreBreakdownProps) {
  const items: ScoreComponent[] = [
    {
      label: "Task Performance",
      ...components.taskPerformance,
      color: "linear-gradient(90deg, var(--purple), var(--purple-dark))",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      ),
    },
    {
      label: "Financial Reliability",
      ...components.financialReliability,
      color: "linear-gradient(90deg, var(--orange), var(--orange-dark))",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
    },
    {
      label: "Dispute Record",
      ...components.disputeRecord,
      color: "linear-gradient(90deg, #22c55e, #16a34a)",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
    },
    {
      label: "Ecosystem Participation",
      ...components.ecosystemParticipation,
      color: "linear-gradient(90deg, var(--lemon), var(--lemon-dim))",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
      ),
    },
    {
      label: "Intellectual Reputation",
      ...components.intellectualReputation,
      color: "linear-gradient(90deg, #a855f7, #7c3aed)",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold uppercase tracking-wider text-muted">
        Score Breakdown
      </h3>
      <div className="space-y-3">
        {items.map((item, i) => {
          const pct = item.max > 0 ? Math.min(100, (item.score / item.max) * 100) : 0;
          return (
            <div
              key={item.label}
              className="group rounded-lg border border-border bg-card/50 p-3 transition-all hover:border-purple/30 hover:bg-card"
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-muted">{item.icon}</span>
                  <span className="text-sm font-semibold text-foreground">
                    {item.label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <SignalBadge signal={item.signal} />
                  <span className="font-mono text-sm font-bold text-foreground">
                    {Math.round(item.score)}/{item.max}
                  </span>
                </div>
              </div>
              <AnimatedBar percent={pct} color={item.color} delay={200 + i * 100} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
