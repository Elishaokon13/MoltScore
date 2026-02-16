"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ScoredAgent } from "@/lib/types";
import { scoredAgentToAgentWithRank, type AgentWithRank } from "@/lib/data";

export function LandingTopPerformers() {
  const [agents, setAgents] = useState<AgentWithRank[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/leaderboard")
      .then((res) => res.json())
      .then((data: { success?: boolean; agents?: ScoredAgent[]; error?: string }) => {
        if (cancelled) return;
        if (!data.success || !Array.isArray(data.agents)) {
          setAgents([]);
          setError(data.error ?? null);
        } else {
          setError(null);
          const top3 = data.agents.slice(0, 3).map((a, i) => scoredAgentToAgentWithRank(a, i + 1));
          setAgents(top3);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load");
          setAgents([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="grid gap-8 pt-6 sm:gap-6 sm:grid-cols-2 sm:pt-8 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="relative">
            <div className="absolute -top-4 -left-4 z-10 h-12 w-12 animate-pulse rounded border border-border bg-card" />
            <div
              className="h-full border border-border bg-card/50 p-6 animate-pulse md:p-8"
              style={{
                clipPath: "polygon(0px 0px, calc(100% - 20px) 0px, 100% 20px, 100% 100%, 20px 100%, 0px calc(100% - 20px))",
              }}
            >
              <div className="mb-6 h-14 w-14 bg-border" style={{ clipPath: "polygon(0px 0px, 100% 0px, 100% 70%, 70% 100%, 0px 100%)" }} />
              <div className="mb-3 h-5 w-32 bg-border" />
              <div className="mb-6 h-4 w-full bg-border" />
              <div className="space-y-2 border-t border-border pt-3">
                {[1, 2, 3, 4].map((j) => (
                  <div key={j} className="flex justify-between">
                    <div className="h-3 w-16 rounded bg-border" />
                    <div className="h-3 w-12 rounded bg-border" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error || agents.length === 0) {
    return (
      <div
        className="border border-border bg-card/50 px-6 py-10 text-center text-muted md:px-8"
        style={{
          clipPath: "polygon(0px 0px, calc(100% - 20px) 0px, 100% 20px, 100% 100%, 20px 100%, 0px calc(100% - 20px))",
        }}
      >
        {error ? (
          <p>Could not load leaderboard. Try again later.</p>
        ) : (
          <p>No agents ranked yet. Run the pipeline to populate the leaderboard.</p>
        )}
        <Link
          href="/app"
          className="mt-4 inline-block text-sm font-medium text-orange hover:underline"
        >
          Open leaderboard →
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 pt-6 sm:gap-6 sm:grid-cols-2 sm:pt-8 lg:grid-cols-3">
      {agents.map((a, i) => (
        <Link
          key={a.id}
          href="/app"
          className="group relative animate-fade-in-up animate-on-load transition-transform duration-300 hover:-translate-y-0.5"
          style={{ animationDelay: `${100 * (i + 1)}ms` }}
        >
          {/* Step number badge — outside clipped card */}
          <div className="absolute -top-4 -left-4 z-10 flex h-12 w-12 items-center justify-center border border-orange/50 bg-background">
            <span className="font-mono text-lg font-bold text-orange">
              {String(a.rank).padStart(2, "0")}
            </span>
          </div>
          <div
            className="relative h-full border border-border bg-card/50 p-5 transition-all duration-300 hover:border-purple/40 hover:shadow-lg hover:shadow-purple/5 md:p-6 lg:p-8"
            style={{
              clipPath: "polygon(0px 0px, calc(100% - 20px) 0px, 100% 20px, 100% 100%, 20px 100%, 0px calc(100% - 20px))",
            }}
          >
            {/* Corner accent triangle */}
            <div
              className="absolute top-0 right-0 h-5 w-5 bg-orange/20"
              style={{ clipPath: "polygon(0px 0px, 100% 100%, 100% 0px)" }}
            />
            {/* Icon box (clipped shape) */}
            <div
              className="mb-6 flex h-14 w-14 items-center justify-center border border-orange/30 bg-orange/10 text-orange transition-colors group-hover:bg-orange/20"
              style={{ clipPath: "polygon(0px 0px, 100% 0px, 100% 70%, 70% 100%, 0px 100%)" }}
            >
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="mb-1 text-lg font-bold tracking-tight text-foreground group-hover:text-orange md:text-xl">
              {a.name}
            </h3>
            <p className="mb-6 truncate font-mono text-xs text-muted">{a.shortWallet}</p>
            <div className="space-y-2 border-t border-border pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Score</span>
                <span className="font-semibold tabular-nums text-foreground">{a.currentScore}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Tier</span>
                <span className="font-semibold text-orange">{a.tier}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Completion</span>
                <span className="font-semibold tabular-nums text-foreground">{a.completionPercent}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">Disputes</span>
                <span className="font-semibold tabular-nums text-foreground">{a.disputes}</span>
              </div>
            </div>
            <div className="mt-6 inline-flex items-center gap-2 border border-lemon/30 bg-lemon/10 px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-lemon" />
              <span className="font-mono text-xs tracking-wider text-lemon">Live</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
