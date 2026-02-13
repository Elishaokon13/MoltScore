import type { RiskTier } from "@/lib/score";

const TIER_STYLES: Record<RiskTier, string> = {
  AAA: "border-[#a855f7] bg-[#a855f7]/20 text-[#c084fc] shadow-[0_0_12px_rgba(168,85,247,0.4)]",
  AA: "border-[#3b82f6] bg-[#3b82f6]/20 text-[#60a5fa]",
  A: "border-[#22c55e] bg-[#22c55e]/20 text-[#4ade80]",
  BBB: "border-[#eab308] bg-[#eab308]/20 text-[#facc15]",
  BB: "border-[#f97316] bg-[#f97316]/20 text-[#fb923c]",
  "Risk Watch": "border-[#ef4444] bg-[#ef4444]/20 text-[#f87171]",
};

export function TierBadge({ tier, className = "" }: { tier: RiskTier; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${TIER_STYLES[tier]} ${className}`}
    >
      {tier}
    </span>
  );
}
