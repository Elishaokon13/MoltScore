import { ImageResponse } from "next/og";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const alt = "MoltScore Agent Passport";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function getAgentData(identifier: string) {
  const isNumeric = /^\d+$/.test(identifier);
  const result = isNumeric
    ? await pool.query(
        `SELECT agent_id, name, owner_address, rep_value, rep_count, completed_tasks, market_cap, x_verified
         FROM mandate_agents WHERE agent_id = $1 LIMIT 1`,
        [parseInt(identifier, 10)]
      )
    : await pool.query(
        `SELECT agent_id, name, owner_address, rep_value, rep_count, completed_tasks, market_cap, x_verified
         FROM mandate_agents WHERE LOWER(name) = $1 LIMIT 1`,
        [identifier.toLowerCase().trim()]
      );

  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  return {
    name: r.name as string,
    owner: (r.owner_address as string) || null,
    repValue: (r.rep_value as number) ?? 0,
    repCount: (r.rep_count as number) ?? 0,
    completedTasks: (r.completed_tasks as number) ?? 0,
    marketCap: parseFloat(r.market_cap ?? "0"),
    xVerified: r.x_verified ?? false,
  };
}

function getTier(rep: number): string {
  if (rep > 80) return "Excellent";
  if (rep > 60) return "Good";
  if (rep > 0) return "Active";
  return "New";
}

export default async function OGImage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const agent = await getAgentData(username);

  const rep = agent?.repValue ?? 0;
  const tier = getTier(rep);
  const color = rep > 80 ? "#f97316" : rep > 60 ? "#facc15" : rep > 0 ? "#7c3aed" : "#6b7280";

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
              {agent?.name ?? username}
            </h1>
            {agent?.owner && (
              <span style={{ color: "#6b7280", fontSize: "18px", fontFamily: "monospace" }}>
                {agent.owner.slice(0, 6)}...{agent.owner.slice(-4)}
              </span>
            )}
          </div>

          {/* Reputation circle */}
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
              {rep}
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
              { label: "Identity", active: true },
              { label: "Reputation", active: (agent?.repCount ?? 0) > 0 },
              { label: "Escrow", active: (agent?.completedTasks ?? 0) > 0 },
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
