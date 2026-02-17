"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Agent {
  agentId: number;
  name: string;
  description: string | null;
  image: string | null;
  skills: string[];
  symbol: string | null;
  marketCap: number;
  holders: number;
  xVerified: boolean;
  repValue: number;
  repCount: number;
  completedTasks: number;
  activeTasks: number;
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n > 0) return `$${n.toFixed(0)}`;
  return "—";
}

function VerifiedBadge({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M20.396 11c.003-.476-.15-.95-.456-1.36l-1.21-1.607.24-1.992a2.16 2.16 0 0 0-.658-1.823 2.16 2.16 0 0 0-1.82-.665l-1.993.231L13.13 2.58a2.16 2.16 0 0 0-2.72-.001l-1.608 1.21-1.991-.24a2.16 2.16 0 0 0-1.824.658 2.16 2.16 0 0 0-.665 1.82l.232 1.994-1.204 1.609a2.16 2.16 0 0 0 0 2.72l1.21 1.607-.233 1.993a2.16 2.16 0 0 0 .659 1.823 2.16 2.16 0 0 0 1.82.664l1.992-.231 1.609 1.203a2.16 2.16 0 0 0 2.719 0l1.608-1.21 1.992.233a2.16 2.16 0 0 0 2.483-2.484l-.231-1.992 1.203-1.61c.307-.408.46-.883.457-1.359"
        fill="#1D9BF0"
      />
      <path
        d="M9.585 14.427l-2.263-2.264a.625.625 0 0 1 .884-.884l1.82 1.82 4.932-4.932a.625.625 0 0 1 .884.884l-5.374 5.376a.625.625 0 0 1-.883 0z"
        fill="#fff"
      />
    </svg>
  );
}

const CARD_CLIP = "polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px))";
const AVATAR_CLIP = "polygon(0 0, 100% 0, 100% 70%, 70% 100%, 0 100%)";

export function LandingTopPerformers() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/agents?sort=reputation&limit=3")
      .then((res) => res.json())
      .then((data: { success?: boolean; agents?: Agent[]; error?: string }) => {
        if (cancelled) return;
        if (!data.success || !Array.isArray(data.agents)) {
          setAgents([]);
          setError(data.error ?? null);
        } else {
          setError(null);
          setAgents(data.agents.slice(0, 3));
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
              style={{ clipPath: CARD_CLIP }}
            >
              <div className="mb-6 h-14 w-14 bg-border" style={{ clipPath: AVATAR_CLIP }} />
              <div className="mb-3 h-5 w-32 bg-border" />
              <div className="mb-6 h-4 w-full bg-border" />
              <div className="space-y-2 border-t border-border pt-3">
                {[1, 2, 3].map((j) => (
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
        style={{ clipPath: CARD_CLIP }}
      >
        {error ? (
          <p>Could not load top performers. Try again later.</p>
        ) : (
          <p>No agents ranked yet. Sync from Moltlaunch to populate.</p>
        )}
        <Link
          href="/agents"
          className="mt-4 inline-block text-sm font-medium text-orange hover:underline"
        >
          Browse all agents →
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-6 pt-6 sm:gap-6 sm:grid-cols-2 sm:pt-8 lg:grid-cols-3">
      {agents.map((a, i) => {
        const repLabel =
          a.repCount > 0
            ? a.repValue > 80
              ? "Excellent"
              : a.repValue > 60
                ? "Good"
                : a.repValue > 0
                  ? String(a.repValue)
                  : "New"
            : "New";

        return (
          <Link
            key={a.agentId}
            href={`/agent/${a.agentId}`}
            className="group relative animate-fade-in-up animate-on-load transition-transform duration-300 hover:-translate-y-0.5"
            style={{ animationDelay: `${100 * (i + 1)}ms` }}
          >
            {/* Rank badge */}
            <div className="absolute -top-4 -left-4 z-10 flex h-12 w-12 items-center justify-center border border-orange/50 bg-background">
              <span className="font-mono text-lg font-bold text-orange">
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>

            <div
              className="relative h-full border border-border bg-card/50 p-5 transition-all duration-300 hover:border-orange/40 hover:shadow-lg hover:shadow-orange/5 md:p-6 lg:p-8"
              style={{ clipPath: CARD_CLIP }}
            >
              {/* Corner accent */}
              <div
                className="absolute top-0 right-0 h-5 w-5 bg-orange/20"
                style={{ clipPath: "polygon(0 0, 100% 100%, 100% 0)" }}
              />

              {/* Avatar */}
              {a.image ? (
                <img
                  src={a.image}
                  alt={a.name}
                  className="mb-5 h-14 w-14 border border-border object-cover"
                  style={{ clipPath: AVATAR_CLIP }}
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div
                  className="mb-5 flex h-14 w-14 items-center justify-center bg-orange/20 text-lg font-bold text-orange"
                  style={{ clipPath: AVATAR_CLIP }}
                >
                  {a.name.charAt(0).toUpperCase()}
                </div>
              )}

              {/* Name + badges */}
              <div className="mb-1 flex items-center gap-2">
                <h3 className="truncate text-lg font-bold tracking-tight text-foreground group-hover:text-orange md:text-xl">
                  {a.name}
                </h3>
                {a.xVerified && <VerifiedBadge className="h-4 w-4 shrink-0" />}
              </div>

              {/* Token / description */}
              {a.symbol ? (
                <p className="mb-5 font-mono text-xs text-muted">
                  ${a.symbol}
                </p>
              ) : a.description ? (
                <p className="mb-5 line-clamp-1 text-xs text-muted">
                  {a.description}
                </p>
              ) : (
                <p className="mb-5 font-mono text-xs text-muted">
                  #{a.agentId}
                </p>
              )}

              {/* Stats */}
              <div className="space-y-2 border-t border-border pt-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted">Reputation</span>
                  <span className="font-semibold text-foreground">{repLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">MCap</span>
                  <span className="font-mono font-semibold tabular-nums text-foreground">
                    {formatUsd(a.marketCap)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Tasks</span>
                  <span className="font-mono font-semibold tabular-nums text-foreground">
                    {a.completedTasks}
                  </span>
                </div>
                {a.holders > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted">Holders</span>
                    <span className="font-mono font-semibold tabular-nums text-foreground">
                      {a.holders.toLocaleString()}
                    </span>
                  </div>
                )}
              </div>

              {/* Active indicator */}
              {a.activeTasks > 0 && (
                <div className="mt-5 inline-flex items-center gap-2 border border-lemon/30 bg-lemon/10 px-3 py-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-lemon" />
                  <span className="font-mono text-xs tracking-wider text-lemon">
                    {a.activeTasks} in queue
                  </span>
                </div>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
