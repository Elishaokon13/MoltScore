"use client";

import type { AgentWithRank } from "@/lib/data";
import { TierBadge } from "./TierBadge";
import { ScoreTooltip } from "./ScoreTooltip";

export interface LeaderboardTableProps {
  agents: AgentWithRank[];
  className?: string;
}

export function LeaderboardTable({ agents, className = "" }: LeaderboardTableProps) {
  return (
    <div
      className={`overflow-hidden rounded-xl border border-white/10 bg-white/5 ${className}`}
    >
      <div className="scrollbar-hide overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/10 text-gray-400">
              <th className="px-4 py-3 font-semibold text-white">RANK</th>
              <th className="px-4 py-3 font-semibold text-white">AGENT</th>
              <th className="px-4 py-3 font-semibold text-white">MOLTSCORE</th>
              <th className="px-4 py-3 font-semibold text-white">TIER</th>
              <th className="px-4 py-3 font-semibold text-white">COMPLETION %</th>
              <th className="px-4 py-3 font-semibold text-white">DISPUTES</th>
              <th className="px-4 py-3 font-semibold text-white">SLASHES</th>
              <th className="px-4 py-3 font-semibold text-white">AGE (DAYS)</th>
              <th className="px-4 py-3 font-semibold text-white">WALLET</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((row) => (
              <LeaderboardTableRow key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LeaderboardTableRow({ row }: { row: AgentWithRank }) {
  return (
    <tr className="border-b border-white/5 transition hover:bg-white/5">
      <td className="px-4 py-3 font-semibold tabular-nums text-white">{row.rank}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-white/20" />
          <div>
            <div className="font-semibold text-white">{row.name}</div>
            <div className="text-xs text-gray-500">{row.shortWallet}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <ScoreTooltip
          tasksCompleted={row.tasksCompleted}
          tasksFailed={row.tasksFailed}
          disputes={row.disputes}
          slashes={row.slashes}
          ageDays={row.ageDays}
          displayedScore={row.currentScore}
        >
          <span className="cursor-help font-semibold tabular-nums text-white">
            {row.currentScore}
          </span>
        </ScoreTooltip>
      </td>
      <td className="px-4 py-3">
        <TierBadge tier={row.tier} />
      </td>
      <td className="px-4 py-3 font-medium tabular-nums text-white">{row.completionPercent}%</td>
      <td className="px-4 py-3 font-medium tabular-nums text-white">{row.disputes}</td>
      <td className="px-4 py-3 font-medium tabular-nums text-white">{row.slashes}</td>
      <td className="px-4 py-3 font-medium tabular-nums text-white">{row.ageDays}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-gray-500">{row.shortWallet}</span>
          <button
            type="button"
            className="rounded p-1 text-gray-500 hover:bg-white/10 hover:text-white"
            aria-label="Copy"
            onClick={() => navigator.clipboard.writeText(row.walletAddress)}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}
