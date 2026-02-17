import { ImageResponse } from "next/og";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const alt = "MoltScore Agent Passport";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function getAgentData(username: string) {
  const normalizedUsername = username.toLowerCase().trim();

  // Try enhanced first
  try {
    const result = await pool.query(
      `SELECT username, wallet, overall_score, tier, data_completeness,
              has_onchain_data, has_debate_data, has_bankr_data
       FROM scored_agents_enhanced
       WHERE LOWER(username) = $1 LIMIT 1`,
      [normalizedUsername]
    );
    if (result.rows.length > 0) {
      const r = result.rows[0] as Record<string, unknown>;
      return {
        username: r.username as string,
        wallet: (r.wallet as string) || null,
        score: r.overall_score as number,
        tier: r.tier as string,
        dataCompleteness: (r.data_completeness as number) ?? 0,
        hasOnchain: r.has_onchain_data as boolean,
        hasDebate: r.has_debate_data as boolean,
        hasBankr: r.has_bankr_data as boolean,
      };
    }
  } catch {
    // table might not exist
  }

  // Try basic
  const basicResult = await pool.query(
    `SELECT username, wallet, score, tier FROM scored_agents WHERE LOWER(username) = $1 LIMIT 1`,
    [normalizedUsername]
  );
  if (basicResult.rows.length > 0) {
    const r = basicResult.rows[0] as Record<string, unknown>;
    return {
      username: r.username as string,
      wallet: (r.wallet as string) || null,
      score: (r.score as number) ?? 0,
      tier: (r.tier as string) ?? "",
      dataCompleteness: 0.4,
      hasOnchain: true,
      hasDebate: false,
      hasBankr: false,
    };
  }
  return null;
}

export default async function OGImage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const agent = await getAgentData(username);

  const tierColors: Record<string, string> = {
    AAA: "#f97316",
    AA: "#f97316",
    A: "#facc15",
    BBB: "#facc15",
    BB: "#7c3aed",
    "Risk Watch": "#ef4444",
  };

  const score = agent?.score ?? 0;
  const tier = agent?.tier ?? "—";
  const color = tierColors[tier] ?? "#7c3aed";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px",
          background: "linear-gradient(135deg, #0f0f11 0%, #1a1025 50%, #0f0f11 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Top section */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "12px",
                  background: "rgba(124, 58, 237, 0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#a78bfa",
                  fontSize: "24px",
                }}
              >
                ◎
              </div>
              <span style={{ color: "#9ca3af", fontSize: "20px", letterSpacing: "0.1em" }}>
                MOLTSCORE
              </span>
            </div>
            <h1 style={{ color: "#ffffff", fontSize: "64px", fontWeight: 800, margin: 0, lineHeight: 1.1 }}>
              {agent?.username ?? username}
            </h1>
            {agent?.wallet && (
              <span style={{ color: "#6b7280", fontSize: "18px", fontFamily: "monospace" }}>
                {agent.wallet.slice(0, 6)}...{agent.wallet.slice(-4)}
              </span>
            )}
          </div>

          {/* Score circle */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: "180px",
              height: "180px",
              borderRadius: "50%",
              border: `4px solid ${color}`,
              background: "rgba(0,0,0,0.4)",
            }}
          >
            <span style={{ color: "#ffffff", fontSize: "56px", fontWeight: 800, fontFamily: "monospace" }}>
              {score}
            </span>
            <span style={{ color, fontSize: "20px", fontWeight: 700, fontFamily: "monospace" }}>
              {tier}
            </span>
          </div>
        </div>

        {/* Bottom section */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div style={{ display: "flex", gap: "16px" }}>
            {[
              { label: "Onchain", active: agent?.hasOnchain ?? false },
              { label: "MoltCourt", active: agent?.hasDebate ?? false },
              { label: "Bankr", active: agent?.hasBankr ?? false },
            ].map((source) => (
              <div
                key={source.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 14px",
                  borderRadius: "20px",
                  background: source.active ? "rgba(34, 197, 94, 0.15)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${source.active ? "rgba(34, 197, 94, 0.3)" : "rgba(255,255,255,0.1)"}`,
                }}
              >
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: source.active ? "#22c55e" : "#6b7280",
                  }}
                />
                <span style={{ color: source.active ? "#4ade80" : "#6b7280", fontSize: "14px" }}>
                  {source.label}
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
            <span style={{ color: "#7c3aed", fontSize: "16px", fontWeight: 600 }}>
              Agent Passport
            </span>
            <span style={{ color: "#6b7280", fontSize: "13px" }}>
              The reputation layer for autonomous agents
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
