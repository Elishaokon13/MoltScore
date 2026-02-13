"use client";

import Link from "next/link";
import { useMemo } from "react";
import { getLeaderboard } from "@/lib/data";
import { LeaderboardTable } from "@/components/LeaderboardTable";

/* Target/bullseye logo */
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

/* Edgy circular icon button: X or paper plane */
function EdgyIconButton({
  icon,
  label,
  onClick,
}: {
  icon: "x" | "paper-plane";
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/5 text-gray-400 transition hover:bg-white/10 hover:text-white"
      aria-label={label}
    >
      {icon === "x" && (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      {icon === "paper-plane" && (
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      )}
    </button>
  );
}

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/app", label: "Leaderboard", active: true },
  { href: "#trackers", label: "Trackers" },
  { href: "#trade", label: "Trade" },
  { href: "#rewards", label: "Rewards" },
];

const timeFilters = ["All Time", "Daily", "Weekly", "Monthly"] as const;

const topTraders = [
  {
    rank: 1,
    name: "Jacob Jones",
    username: "@jacob_99",
    pnl: "880.43",
    pnlUnit: "SOL",
    followers: "1.4k",
    winRate: "5.00",
    profit: "$283,789.00",
    wallet: "0x5095a40...679a9659",
    highlighted: false,
  },
  {
    rank: 2,
    name: "Robert Fox",
    username: "@robert_fox",
    pnl: "880.43",
    pnlUnit: "SOL",
    followers: "1.5k",
    winRate: "5.00",
    profit: "$283,789.00",
    wallet: "0x5095a40...679a9659",
    highlighted: true,
  },
  {
    rank: 3,
    name: "Wade Warren",
    username: "@wade_warren",
    pnl: "880.43",
    pnlUnit: "SOL",
    followers: "1.3k",
    winRate: "5.00",
    profit: "$283,789.00",
    wallet: "0x5095a40...679a9659",
    highlighted: false,
  },
];

const tableTraders = [
  { rank: 4, name: "Cupsey", username: "@johnsmith0", pnl: "880.439", winRate: "4.8", profit: "$170,894.3", followers: "1.1k", wallet: "0x5095a40...679a9659" },
  { rank: 5, name: "Jane Cooper", username: "@jane_c", pnl: "850.12", winRate: "4.7", profit: "$165,200.0", followers: "1.0k", wallet: "0x7f3b2c1...891a1234" },
  { rank: 6, name: "Ralph Edwards", username: "@ralph_e", pnl: "820.88", winRate: "4.6", profit: "$158,440.2", followers: "0.9k", wallet: "0x1a2b3c4...567d8901" },
  { rank: 7, name: "Eleanor Pena", username: "@eleanor_p", pnl: "795.33", winRate: "4.5", profit: "$152,100.5", followers: "0.8k", wallet: "0x9e8d7c6...543b2109" },
  { rank: 8, name: "Devon Lane", username: "@devon_l", pnl: "770.00", winRate: "4.4", profit: "$148,000.0", followers: "0.7k", wallet: "0x4f5e6d7...890c1234" },
  { rank: 9, name: "Cameron Williamson", username: "@cam_w", pnl: "745.67", winRate: "4.3", profit: "$142,789.1", followers: "0.6k", wallet: "0x2b3c4d5...678e9012" },
];

export default function AppLeaderboardPage() {
  const topAgents = useMemo(
    () => getLeaderboard("score", false).slice(0, 10),
    []
  );
  return (
    <div className="min-h-screen bg-linear-to-br from-pink-500/20 via-purple-600/30 to-emerald-500/20">
      <div className="min-h-screen w-full bg-[#0f0f11]">
        {/* Top nav */}
        <header className="flex h-14 items-center justify-between gap-4 border-b border-white/10 px-6">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 text-white">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
                <LogoIcon className="h-5 w-5 text-white" />
              </div>
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              {navLinks.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    item.active
                      ? "bg-white/10 text-white ring-1 ring-purple-500/50"
                      : "text-gray-400 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/5 pl-3 pr-2 text-gray-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="w-24 text-sm">Search...</span>
              <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-xs">Ctrl K</kbd>
            </div>
            <button
              type="button"
              className="rounded-lg bg-[#6650f8] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#5540e0]"
            >
              Deposit
            </button>
            <button type="button" className="rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white" aria-label="Notifications">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </button>
            <button type="button" className="rounded-lg p-2 text-gray-400 hover:bg-white/10 hover:text-white" aria-label="Settings">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <div className="h-8 w-8 overflow-hidden rounded-full bg-white/20 ring-2 ring-white/30" />
          </div>
        </header>

        <main className="p-6">
          {/* Title + time filters */}
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-2xl font-bold text-white">PNL Leaderboard</h1>
            <div className="flex gap-2">
              {timeFilters.map((filter, i) => (
                <button
                  key={filter}
                  type="button"
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    i === 0
                      ? "bg-white/15 text-white"
                      : "text-gray-400 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          {/* Top 3 trader cards */}
          <div className="mb-8 grid gap-6 md:grid-cols-3">
            {topTraders.map((t) => (
              <div
                key={t.rank}
                className={`rounded-xl border-2 bg-linear-to-b from-white/[0.07] to-transparent p-5 ${
                  t.highlighted ? "border-[#6650f8] ring-2 ring-[#6650f8]/30" : "border-white/10"
                }`}
              >
                <div className="mb-4 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 overflow-hidden rounded-full bg-white/20" />
                    <div>
                      <div className="font-bold text-white">{t.name}</div>
                      <div className="text-sm text-gray-500">{t.username}</div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <EdgyIconButton icon="x" label="Remove" />
                    <EdgyIconButton icon="paper-plane" label="Message" />
                  </div>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">PNL</span>
                    <span className="font-semibold text-white">
                      +{t.pnl} <span className="font-normal text-gray-500">{t.pnlUnit}</span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">FOLLOWERS</span>
                    <span className="font-semibold text-white">{t.followers}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">WIN RATE</span>
                    <span className="font-semibold text-[#22c55e]">{t.winRate}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">PROFIT</span>
                    <span className="font-semibold text-[#22c55e]">{t.profit}</span>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/10 pt-4">
                  <span className="truncate text-xs text-gray-500">{t.wallet}</span>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-gray-400 transition hover:bg-white/10 hover:text-white"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* MoltScore Leaderboard table (reusable component) */}
          <LeaderboardTable agents={topAgents} />
        </main>
      </div>
    </div>
  );
}
