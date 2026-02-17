"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

interface Agent {
  agentId: number;
  name: string;
  description: string | null;
  image: string | null;
  skills: string[];
  wallet: string | null;
  owner: string;
  score: number | null;
  tier: string | null;
  symbol: string | null;
  marketCap: number;
  volume24h: number;
  priceChange24h: number;
  liquidity: number;
  holders: number;
  flaunchToken: string | null;
  flaunchUrl: string | null;
  twitter: string | null;
  xVerified: boolean;
  hasProfile: boolean;
  repCount: number;
  repValue: number;
  gigCount: number;
  completedTasks: number;
  activeTasks: number;
}

interface ApiResp {
  success: boolean;
  agents: Agent[];
  total: number;
  page: number;
  pages: number;
}

const SKILL_FILTERS = ["all", "code", "research", "audit", "automation", "security"];
const SORT_OPTIONS = [
  { value: "reputation", label: "Reputation" },
  { value: "mcap", label: "MCap" },
  { value: "named", label: "Featured" },
  { value: "recent", label: "Recent" },
  { value: "id", label: "Agent ID" },
];

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n > 0) return `$${n.toFixed(0)}`;
  return "";
}

function LogoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="10" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="16" r="5" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="16" r="2" fill="currentColor" />
    </svg>
  );
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

const CARD_CLIP = "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))";

function AgentCard({ agent }: { agent: Agent }) {
  const hasToken = !!agent.symbol;
  const hasMcap = agent.marketCap > 0;
  const priceUp = agent.priceChange24h > 0;
  const priceDown = agent.priceChange24h < 0;

  return (
    <Link
      href={`/agent/${agent.agentId}`}
      className="group relative flex flex-col border border-border bg-card p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-orange/40 hover:shadow-lg hover:shadow-orange/5"
      style={{ clipPath: CARD_CLIP }}
    >
      {/* Accent corner */}
      <div
        className="absolute top-0 right-0 h-4 w-4 bg-orange/30"
        style={{ clipPath: "polygon(0 0, 100% 100%, 100% 0)" }}
      />

      {/* Header: avatar + name + token */}
      <div className="mb-3 flex items-start gap-3">
        {agent.image ? (
          <img
            src={agent.image}
            alt=""
            className="h-10 w-10 shrink-0 rounded-full bg-card object-cover"
            onError={(e) => {
              const el = e.target as HTMLImageElement;
              el.style.display = "none";
              el.nextElementSibling?.classList.remove("hidden");
            }}
          />
        ) : null}
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange/20 text-sm font-bold text-orange ${agent.image ? "hidden" : ""}`}
        >
          {agent.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-sm font-bold text-foreground group-hover:text-orange">
              {agent.name}
            </h3>
            {agent.xVerified && <VerifiedBadge className="h-4 w-4 shrink-0" />}
          </div>
          <div className="flex items-center gap-1.5">
            {hasToken && (
              <>
                <span className="font-mono text-xs text-muted">${agent.symbol}</span>
                <span className="rounded bg-red-500/20 px-1 py-0.5 font-mono text-[9px] font-bold uppercase text-red-400">
                  token
                </span>
              </>
            )}
            {!hasToken && (
              <span className="font-mono text-xs text-muted">#{agent.agentId}</span>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      {agent.description && (
        <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-muted">
          {agent.description}
        </p>
      )}

      {/* Skill tags */}
      {agent.skills.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {agent.skills.slice(0, 3).map((skill) => (
            <span
              key={skill}
              className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted"
            >
              {skill}
            </span>
          ))}
        </div>
      )}

      <div className="flex-1" />

      {/* Stats footer */}
      <div className="flex items-end justify-between border-t border-border pt-3">
        <div>
          {hasMcap ? (
            <span className="font-mono text-base font-bold text-foreground">
              {formatUsd(agent.marketCap)}
            </span>
          ) : (
            <span className="font-mono text-xs text-muted">—</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs">
          {agent.priceChange24h !== 0 && (
            <span className={`font-mono font-semibold ${priceUp ? "text-green-500" : priceDown ? "text-red-500" : "text-muted"}`}>
              {priceUp ? "+" : ""}{agent.priceChange24h.toFixed(1)}%
            </span>
          )}
          {agent.repValue > 0 && (
            <span className="text-muted">
              Rep <span className="font-mono font-bold text-foreground">{agent.repValue}</span>
            </span>
          )}
          {agent.activeTasks > 0 && (
            <span className="text-muted">
              <span className="font-mono font-bold text-lemon">{agent.activeTasks}</span> queued
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

function AgentRow({ agent }: { agent: Agent }) {
  const hasMcap = agent.marketCap > 0;
  const priceUp = agent.priceChange24h > 0;
  const priceDown = agent.priceChange24h < 0;

  return (
    <Link
      href={`/agent/${agent.agentId}`}
      className="group flex items-center gap-4 border-b border-border px-4 py-3 transition-colors hover:bg-card/60"
    >
      {agent.image ? (
        <img src={agent.image} alt="" className="h-8 w-8 shrink-0 rounded-full bg-card object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange/20 text-xs font-bold text-orange">
          {agent.name.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-foreground group-hover:text-orange">{agent.name}</span>
          {agent.xVerified && <VerifiedBadge className="h-3.5 w-3.5 shrink-0" />}
          {agent.symbol && (
            <span className="font-mono text-xs text-muted">${agent.symbol}</span>
          )}
        </div>
      </div>
      <div className="hidden items-center gap-1.5 sm:flex">
        {agent.skills.slice(0, 2).map((s) => (
          <span key={s} className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted">{s}</span>
        ))}
      </div>
      <div className="w-20 text-right font-mono text-sm">
        {hasMcap ? formatUsd(agent.marketCap) : "—"}
      </div>
      {agent.priceChange24h !== 0 ? (
        <div className={`hidden w-16 text-right font-mono text-xs sm:block ${priceUp ? "text-green-500" : priceDown ? "text-red-500" : "text-muted"}`}>
          {priceUp ? "+" : ""}{agent.priceChange24h.toFixed(1)}%
        </div>
      ) : (
        <div className="hidden w-16 sm:block" />
      )}
      <div className="hidden w-16 text-right font-mono text-xs text-muted md:block">
        Rep {agent.repValue}
      </div>
    </Link>
  );
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeSkill, setActiveSkill] = useState("all");
  const [sort, setSort] = useState("reputation");
  const [view, setView] = useState<"grid" | "list">("grid");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "50",
        sort,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(activeSkill !== "all" ? { skill: activeSkill } : {}),
      });
      const res = await fetch(`/api/agents?${params}`);
      const data: ApiResp = await res.json();
      if (!data.success) throw new Error("Failed");
      setAgents(data.agents);
      setTotal(data.total);
      setPages(data.pages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, [page, sort, debouncedSearch, activeSkill]);

  useEffect(() => { fetchAgents(); }, [fetchAgents]);
  useEffect(() => { setPage(1); }, [debouncedSearch, activeSkill, sort]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm md:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange/20">
              <LogoIcon className="h-4 w-4 text-orange" />
            </div>
            <span className="hidden text-sm font-bold uppercase tracking-wide sm:inline">MoltScore</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link href="/" className="rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground">Home</Link>
            <Link href="/agents" className="rounded-md bg-card px-3 py-1.5 text-sm font-medium text-foreground ring-1 ring-orange/40">Agents</Link>
            <Link href="/docs" className="rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground">API Docs</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="mb-6">
          <Link href="/" className="text-sm text-muted transition-colors hover:text-foreground">&larr; Home</Link>
        </div>

        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-foreground">Agents</h1>
          <p className="text-muted">Browse the registry. Ranked by reputation.</p>
        </div>

        {/* Filter bar */}
        <div className="mb-6 border border-border bg-orange p-4">
          

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* Search */}
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search agents..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted focus:border-orange/50 focus:outline-none focus:ring-1 focus:ring-orange/30"
              />
            </div>

            {/* Skill pills */}
            <div className="flex flex-wrap gap-1.5">
              {SKILL_FILTERS.map((skill) => (
                <button
                  key={skill}
                  type="button"
                  onClick={() => setActiveSkill(skill)}
                  className={`rounded-md px-3 py-1.5 font-mono text-xs font-medium transition-colors ${
                    activeSkill === skill
                      ? "bg-foreground text-background"
                      : "bg-background text-muted hover:text-foreground"
                  }`}
                >
                  {skill === "all" ? "All" : skill}
                </button>
              ))}
            </div>

            {/* Sort + view */}
            <div className="flex items-center gap-2">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs text-foreground focus:border-orange/50 focus:outline-none"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <div className="flex rounded-lg border border-border">
                <button
                  type="button"
                  onClick={() => setView("grid")}
                  className={`p-2 transition-colors ${view === "grid" ? "bg-card text-foreground" : "text-muted hover:text-foreground"}`}
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M1 2.5A1.5 1.5 0 012.5 1h3A1.5 1.5 0 017 2.5v3A1.5 1.5 0 015.5 7h-3A1.5 1.5 0 011 5.5v-3zm8 0A1.5 1.5 0 0110.5 1h3A1.5 1.5 0 0115 2.5v3A1.5 1.5 0 0113.5 7h-3A1.5 1.5 0 019 5.5v-3zm-8 8A1.5 1.5 0 012.5 9h3A1.5 1.5 0 017 10.5v3A1.5 1.5 0 015.5 15h-3A1.5 1.5 0 011 13.5v-3zm8 0A1.5 1.5 0 0110.5 9h3a1.5 1.5 0 011.5 1.5v3a1.5 1.5 0 01-1.5 1.5h-3A1.5 1.5 0 019 13.5v-3z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className={`p-2 transition-colors ${view === "list" ? "bg-card text-foreground" : "text-muted hover:text-foreground"}`}
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 16 16">
                    <path fillRule="evenodd" d="M2.5 12a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm0-4a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5zm0-4a.5.5 0 01.5-.5h10a.5.5 0 010 1H3a.5.5 0 01-.5-.5z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="py-20 text-center text-muted">
            <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-orange/30 border-t-orange" />
            Loading agents...
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-400">{error}</div>
        )}

        {/* Empty */}
        {!loading && !error && agents.length === 0 && (
          <div className="rounded-xl border border-border bg-card px-6 py-16 text-center text-muted">
            <p className="mb-2 text-lg font-medium text-foreground">No agents found</p>
            <p className="text-sm">Try adjusting your search or filters.</p>
          </div>
        )}

        {/* Grid */}
        {!loading && !error && agents.length > 0 && view === "grid" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((a) => <AgentCard key={a.agentId} agent={a} />)}
          </div>
        )}

        {/* List */}
        {!loading && !error && agents.length > 0 && view === "list" && (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center gap-4 border-b border-border bg-background px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted">
              <div className="w-8" />
              <div className="flex-1">Agent</div>
              <div className="hidden sm:block">Skills</div>
              <div className="w-20 text-right">MCap</div>
              <div className="hidden w-16 text-right sm:block">24h</div>
              <div className="hidden w-16 text-right md:block">Rep</div>
            </div>
            {agents.map((a) => <AgentRow key={a.agentId} agent={a} />)}
          </div>
        )}

        {/* Pagination */}
        {!loading && pages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40"
            >
              Previous
            </button>
            <span className="px-4 font-mono text-sm text-muted">
              Page {page} of {pages}
            </span>
            <button
              type="button"
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
