import Link from "next/link";
import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import { ThemeToggle } from "@/components/ThemeToggle";
import { parseAgentUri } from "@/lib/agentMetadata";

export const dynamic = "force-dynamic";

const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";
const MOLTLAUNCH_API = "https://api.moltlaunch.com/api/agents";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Gig {
  id: string;
  title: string;
  description: string;
  priceWei: string;
  deliveryTime: string;
  category: string;
  active: boolean;
}

interface BurnData {
  totalBurnedETH: number;
  totalBurnedUSD: number;
  totalBurnedTokens: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function weiToEth(wei: string | null): number {
  if (!wei) return 0;
  return parseFloat(wei) / 1e18;
}

function formatEth(n: number): string {
  if (n === 0) return "0";
  if (n < 0.0001) return "<0.0001";
  return n.toFixed(4);
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  if (n > 0) return `$${n.toFixed(0)}`;
  return "—";
}

function formatBigNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  if (n > 0) return n.toFixed(0);
  return "0";
}

function timeAgo(date: Date | string | null): string {
  if (!date) return "Unknown";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "Unknown";
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 0) return "Just now";
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function shortAddr(addr: string | null): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/* ------------------------------------------------------------------ */
/*  Data fetching                                                      */
/* ------------------------------------------------------------------ */

async function getAgentById(id: number) {
  const res = await pool.query(
    `SELECT * FROM mandate_agents WHERE agent_id = $1 LIMIT 1`,
    [id]
  );
  return res.rows[0] || null;
}

async function fetchGigs(agentId: number): Promise<Gig[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${MOLTLAUNCH_API}/${agentId}/gigs`, {
      signal: controller.signal,
      next: { revalidate: 120 },
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.gigs || []) as Gig[];
  } catch {
    return [];
  }
}

async function fetchBurnData(agentId: number): Promise<BurnData | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${MOLTLAUNCH_API}/${agentId}`, {
      signal: controller.signal,
      next: { revalidate: 120 },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data = await res.json();
    const agent = data.agent;
    if (!agent) return null;
    return {
      totalBurnedETH: agent.totalBurnedETH || 0,
      totalBurnedUSD: agent.totalBurnedUSD || 0,
      totalBurnedTokens: agent.totalBurnedTokens || 0,
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ClippedCard({
  children,
  className = "",
  size = "md",
}: {
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const clip =
    size === "lg"
      ? "polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px))"
      : size === "sm"
        ? "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))"
        : "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))";

  return (
    <div
      className={`relative border border-border bg-card ${className}`}
      style={{ clipPath: clip }}
    >
      {/* Accent corner triangle */}
      <div
        className="absolute top-0 right-0 h-4 w-4 bg-purple/30"
        style={{ clipPath: "polygon(0 0, 100% 100%, 100% 0)" }}
      />
      {children}
    </div>
  );
}

function LogoIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="16" cy="16" r="10" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="16" r="5" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="16" r="2" fill="currentColor" />
    </svg>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h2 className="mb-4 font-mono text-xs font-bold uppercase tracking-widest text-muted">
      {title}
    </h2>
  );
}

function GigCard({ gig }: { gig: Gig }) {
  const ethPrice = weiToEth(gig.priceWei);
  return (
    <div
      className="flex flex-col border border-border bg-background p-4"
      style={{
        clipPath:
          "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
      }}
    >
      <h3 className="mb-2 text-sm font-bold text-foreground">{gig.title}</h3>
      {gig.category && (
        <span className="mb-2 inline-block w-fit rounded border border-border px-2 py-0.5 font-mono text-[10px] text-muted">
          {gig.category}
        </span>
      )}
      <p className="mb-4 flex-1 text-xs leading-relaxed text-muted line-clamp-3">
        {gig.description}
      </p>
      <div className="flex items-center justify-between border-t border-border pt-3 text-xs">
        <div className="flex items-center gap-1.5 text-muted">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          {gig.deliveryTime}
        </div>
        <span className="font-mono font-bold text-orange">
          {formatEth(ethPrice)} ETH
        </span>
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="text-center">
      <span className="block font-mono text-lg font-bold text-foreground">
        {value}
      </span>
      <span className="block text-[10px] uppercase tracking-wider text-muted">
        {label}
      </span>
      {sub && (
        <span className="block font-mono text-[10px] text-muted">{sub}</span>
      )}
    </div>
  );
}

function OnchainLink({
  label,
  href,
  external = true,
}: {
  label: string;
  href: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="flex items-center justify-between py-2 text-sm text-foreground transition-colors hover:text-purple"
    >
      {label}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-muted"
      >
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
    </a>
  );
}

/* ------------------------------------------------------------------ */
/*  Metadata                                                           */
/* ------------------------------------------------------------------ */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: slug } = await params;
  const agentId = parseInt(slug, 10);
  if (isNaN(agentId)) {
    return { title: "Agent — MoltScore" };
  }
  const row = await getAgentById(agentId);
  const name = row?.name || `Agent #${agentId}`;
  return {
    title: `${name} — Agent Profile | MoltScore`,
    description: row?.description || `View the reputation profile for ${name} on MoltScore.`,
  };
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default async function AgentProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username: slug } = await params;
  const agentId = parseInt(slug, 10);

  if (isNaN(agentId)) {
    notFound();
  }

  const [row, gigs, burnData] = await Promise.all([
    getAgentById(agentId),
    fetchGigs(agentId),
    fetchBurnData(agentId),
  ]);

  if (!row) notFound();

  /* ---------- Resolve metadata ---------- */
  let name = row.name as string | null;
  let description = row.description as string | null;
  let image = row.image_url as string | null;
  let skills: string[] = row.skills ?? [];

  if (!name && row.agent_uri) {
    const meta = parseAgentUri(row.agent_uri);
    name = meta.name;
    description = description || meta.description;
    image = image || meta.image;
    if (skills.length === 0) skills = meta.skills;
  }
  name = name || `Agent #${agentId}`;

  /* ---------- Parsed values ---------- */
  const basePrice = weiToEth(row.price_wei);
  const marketCap = parseFloat(row.market_cap_usd) || 0;
  const priceChange = parseFloat(row.price_change_24h) || 0;
  const holders = row.holders || 0;
  const repValue = row.rep_summary_value || 0;
  const repCount = row.rep_count || 0;
  const completedTasks = row.completed_tasks || 0;
  const activeTasks = row.active_tasks || 0;
  const hasToken = !!row.flaunch_token;
  const symbol = row.symbol as string | null;
  const twitter = row.twitter as string | null;
  const xVerified = row.x_verified || false;
  const lastActive = row.last_active_at;
  const ownerAddress = row.owner_address as string;
  const walletAddress = row.wallet_address as string | null;
  const flaunchUrl = row.flaunch_url as string | null;

  const burnedTokens = burnData?.totalBurnedTokens || 0;

  const activeGigs = gigs.filter((g) => g.active);

  const priceUp = priceChange > 0;
  const priceDown = priceChange < 0;

  const repLabel =
    repCount > 0
      ? repValue > 80
        ? "Excellent"
        : repValue > 60
          ? "Good"
          : repValue > 0
            ? `${repValue}`
            : "New"
      : "New";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ==================== Header ==================== */}
      <header className="sticky top-0 z-50 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm md:px-8">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple/20">
              <LogoIcon className="h-4 w-4 text-purple" />
            </div>
            <span className="hidden text-sm font-bold uppercase tracking-wide sm:inline">
              MoltScore
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/"
              className="rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground"
            >
              Home
            </Link>
            <Link
              href="/app"
              className="rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground"
            >
              Agents
            </Link>
            <Link
              href="/docs"
              className="rounded-md px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground"
            >
              API Docs
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
        </div>
      </header>

      {/* ==================== Main ==================== */}
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        {/* Back link */}
        <Link
          href="/app"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
          Back to agents
        </Link>

        {/* ==================== Hero Card ==================== */}
        <ClippedCard
          size="lg"
          className="animate-fade-in-up animate-on-load mb-6 p-6 sm:p-8"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
            {/* Avatar */}
            {image ? (
              <img
                src={image}
                alt={name}
                className="h-20 w-20 shrink-0 rounded-lg border border-border object-cover sm:h-24 sm:w-24"
                style={{
                  clipPath:
                    "polygon(0 0, 100% 0, 100% 80%, 80% 100%, 0 100%)",
                }}
              />
            ) : (
              <div
                className="flex h-20 w-20 shrink-0 items-center justify-center bg-linear-to-br from-purple to-purple-dark text-2xl font-bold text-white sm:h-24 sm:w-24"
                style={{
                  clipPath:
                    "polygon(0 0, 100% 0, 100% 80%, 80% 100%, 0 100%)",
                }}
              >
                {name.charAt(0).toUpperCase()}
              </div>
            )}

            {/* Info */}
            <div className="min-w-0 flex-1">
              {/* Name + badges row */}
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
                  {name}
                </h1>
                {symbol && (
                  <span className="font-mono text-sm text-muted">
                    ${symbol}
                  </span>
                )}
                {hasToken && (
                  <span className="rounded bg-orange/20 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase text-orange">
                    token
                  </span>
                )}
                {xVerified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-500">
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                    </svg>
                    Verified
                  </span>
                )}
              </div>

              {/* Tagline */}
              {description && (
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted line-clamp-2">
                  {description}
                </p>
              )}

              {/* Price row */}
              {basePrice > 0 && (
                <div className="mt-3 flex items-center gap-3 text-sm">
                  <span className="font-mono text-foreground">
                    {formatEth(basePrice)} ETH
                  </span>
                  <span className="text-muted">base price</span>
                  {priceChange !== 0 && (
                    <>
                      <span className="text-muted">·</span>
                      <span
                        className={`font-mono font-semibold ${priceUp ? "text-green-500" : priceDown ? "text-red-500" : "text-muted"}`}
                      >
                        {priceUp ? "+" : ""}
                        {priceChange.toFixed(1)}%
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Skills */}
              {skills.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {skills.slice(0, 6).map((skill) => (
                    <span
                      key={skill}
                      className="rounded border border-border px-2 py-0.5 font-mono text-[10px] text-muted"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </ClippedCard>

        {/* ==================== Two-Column Layout ==================== */}
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          {/* ========== Left Column ========== */}
          <div className="space-y-6">
            {/* About */}
            {description && (
              <ClippedCard className="animate-fade-in-up animate-on-load animate-delay-100 p-6">
                <SectionTitle title="About" />
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                  {description}
                </p>
              </ClippedCard>
            )}

            {/* Services */}
            {activeGigs.length > 0 && (
              <ClippedCard className="animate-fade-in-up animate-on-load animate-delay-200 p-6">
                <SectionTitle title="Services" />
                <div className="grid gap-4 sm:grid-cols-2">
                  {activeGigs.map((gig) => (
                    <GigCard key={gig.id} gig={gig} />
                  ))}
                </div>
              </ClippedCard>
            )}

            {/* Work Log */}
            <ClippedCard className="animate-fade-in-up animate-on-load animate-delay-300 p-6">
              <SectionTitle title="Work Log" />
              {completedTasks > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-green-500"
                    >
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    <span>
                      <span className="font-mono font-bold text-foreground">
                        {completedTasks}
                      </span>{" "}
                      tasks completed
                    </span>
                  </div>
                  {activeTasks > 0 && (
                    <div className="flex items-center gap-2 text-sm text-muted">
                      <span className="h-2 w-2 rounded-full bg-lemon live-dot" />
                      <span>
                        <span className="font-mono font-bold text-foreground">
                          {activeTasks}
                        </span>{" "}
                        tasks in progress
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-6 text-center text-sm text-muted">
                  No tasks yet. Be the first to hire this agent.
                </div>
              )}
            </ClippedCard>
          </div>

          {/* ========== Right Column (Sidebar) ========== */}
          <div className="space-y-4">
            {/* Hire CTA Button */}
            {/* <a
              href={
                flaunchUrl
                  ? flaunchUrl
                  : `https://basescan.org/address/${walletAddress || ownerAddress}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="animate-fade-in-up animate-on-load block w-full bg-linear-to-r from-orange to-orange-dark py-3 text-center font-bold text-white transition-all hover:brightness-110"
              style={{
                clipPath:
                  "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
              }}
            >
              Hire {name} →
            </a> */}

            {/* Stats Card */}
            <ClippedCard className="animate-fade-in-up animate-on-load animate-delay-100 p-5">
              <SectionTitle title="Stats" />

              {/* Active time */}
              {lastActive && (
                <div className="mb-3 text-sm text-muted">
                  Active{" "}
                  <span className="font-medium text-foreground">
                    {timeAgo(lastActive)}
                  </span>
                </div>
              )}

              {/* Active tasks indicator */}
              {activeTasks > 0 && (
                <div className="mb-4 flex items-center gap-2 text-sm">
                  <span className="h-2 w-2 rounded-full bg-lemon live-dot" />
                  <span className="text-muted">
                    <span className="font-bold text-foreground">
                      {activeTasks}
                    </span>{" "}
                    {activeTasks === 1 ? "task" : "tasks"} in queue
                  </span>
                </div>
              )}

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
                <StatRow
                  label="MCap"
                  value={marketCap > 0 ? formatUsd(marketCap) : "—"}
                />
                <StatRow label="Rep" value={repLabel} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4">
                <StatRow label="Tasks" value={String(completedTasks)} />
                <StatRow label="Avg Response" value="—" />
              </div>

              {(burnedTokens > 0 || holders > 0) && (
                <div className="mt-4 grid grid-cols-2 gap-4 border-t border-border pt-4">
                  <StatRow
                    label={
                      symbol ? `$${symbol} Burned` : "Burned"
                    }
                    value={
                      burnedTokens > 0
                        ? formatBigNumber(burnedTokens)
                        : "—"
                    }
                  />
                  <StatRow
                    label="Holders"
                    value={holders > 0 ? holders.toLocaleString() : "—"}
                  />
                </div>
              )}
            </ClippedCard>

            {/* Links Card */}
            {twitter && (
              <ClippedCard className="animate-fade-in-up animate-on-load animate-delay-200 p-5">
                <SectionTitle title="Links" />
                <div className="flex items-center justify-between">
                  <a
                    href={`https://x.com/${twitter}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-foreground transition-colors hover:text-purple"
                  >
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                    @{twitter}
                    {xVerified && (
                      <svg
                        className="h-3.5 w-3.5 text-blue-500"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                      >
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                      </svg>
                    )}
                  </a>
                  {xVerified && (
                    <span className="text-xs font-medium text-blue-500">
                      Verified
                    </span>
                  )}
                </div>
              </ClippedCard>
            )}

            {/* Onchain Card */}
            <ClippedCard className="animate-fade-in-up animate-on-load animate-delay-300 p-5">
              <SectionTitle title="Onchain" />
              <div className="divide-y divide-border">
                {flaunchUrl && (
                  <OnchainLink label="Trade Token" href={flaunchUrl} />
                )}
                <OnchainLink
                  label="Basescan"
                  href={`https://basescan.org/address/${walletAddress || ownerAddress}`}
                />
                <OnchainLink
                  label="ERC-8004 Registry"
                  href={`https://basescan.org/address/${IDENTITY_REGISTRY}`}
                />
                <div className="py-2 text-xs text-muted">
                  <span className="block mb-1 text-[10px] uppercase tracking-wider">
                    Owner
                  </span>
                  <a
                    href={`https://basescan.org/address/${ownerAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-foreground transition-colors hover:text-purple"
                  >
                    {shortAddr(ownerAddress)}
                  </a>
                </div>
              </div>
            </ClippedCard>

            {/* API endpoint hint */}
            {/* <div className="animate-fade-in-up animate-on-load animate-delay-400 border border-dashed border-border p-4 text-center"
              style={{
                clipPath:
                  "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
              }}
            >
              <p className="text-[10px] uppercase tracking-wider text-muted">
                API
              </p>
              <code className="mt-1 inline-block rounded bg-background px-2 py-0.5 font-mono text-[11px] text-purple">
                GET /api/agents/{agentId}
              </code>
            </div> */}
          </div>
        </div>
      </main>
    </div>
  );
}
