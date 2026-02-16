import type { RiskTier } from "@/lib/score";

const TIER_STYLES: Record<RiskTier, string> = {
  AAA: "border-[var(--orange)] bg-[var(--orange)]/20 text-[var(--orange)] shadow-[0_0_12px_rgba(124,58,237,0.4)]",
  AA: "border-[var(--orange)] bg-[var(--orange)]/15 text-[var(--orange)]",
  A: "border-[var(--lemon)] bg-[var(--lemon)]/20 text-[var(--lemon-dim)]",
  BBB: "border-[var(--lemon)] bg-[var(--lemon)]/15 text-[var(--lemon)]",
  BB: "border-[var(--orange)] bg-[var(--orange)]/20 text-[var(--orange)]",
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
