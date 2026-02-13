"use client";

import { getScoreBreakdown } from "@/lib/score";

type Props = {
  tasksCompleted: number;
  tasksFailed: number;
  disputes: number;
  slashes: number;
  ageDays: number;
  displayedScore?: number;
  children: React.ReactNode;
};

export function ScoreTooltip({
  tasksCompleted,
  tasksFailed,
  disputes,
  slashes,
  ageDays,
  displayedScore,
  children,
}: Props) {
  const breakdown = getScoreBreakdown({
    tasksCompleted,
    tasksFailed,
    disputes,
    slashes,
    ageDays,
  });

  return (
    <span className="group relative inline-block">
      {children}
      <span
        className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-white/20 bg-[#1a1a1e] px-3 py-2 text-xs opacity-0 shadow-xl transition-opacity group-hover:opacity-100"
        role="tooltip"
      >
        <div className="mb-1.5 font-semibold text-white">Score breakdown</div>
        <div className="space-y-1">
          {breakdown.map((row) => (
            <div key={row.label} className="flex justify-between gap-4 text-gray-400">
              <span>{row.label}</span>
              <span className={row.value >= 0 ? "text-white" : "text-red-400"}>
                {row.value >= 0 ? "+" : ""}
                {row.value}
              </span>
            </div>
          ))}
          <div className="mt-1.5 border-t border-white/10 pt-1.5 font-medium text-white">
            {displayedScore != null
              ? `Displayed: ${displayedScore} (clamped 300–950)`
              : "Clamped 300–950"}
          </div>
        </div>
      </span>
    </span>
  );
}
