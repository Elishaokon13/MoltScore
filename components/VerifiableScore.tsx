"use client";

import { useState } from "react";

interface Attestation {
  signer: string;
  signature: string;
  message: string;
  timestamp: number;
}

interface VerifiedScore {
  score: {
    agentId: number;
    score: number;
    components: {
      peerReputation: number;
      taskCompletion: number;
      economicActivity: number;
      identityCompleteness: number;
    };
    timestamp: number;
    version: string;
  };
  attestation: Attestation;
}

function EigenCloudIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 22V12" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 7l9 5 9-5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

export function VerifiableScore({ agentId }: { agentId: number }) {
  const [data, setData] = useState<VerifiedScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const verify = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/verify/${agentId}`);
      const json = await res.json();
      if (!json.success) {
        setError(json.error || "Verification failed");
      } else {
        setData(json);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="relative border border-border bg-card"
      style={{
        clipPath: "polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 16px 100%, 0 calc(100% - 16px))",
      }}
    >
      <div
        className="absolute top-0 right-0 h-4 w-4 bg-purple/30"
        style={{ clipPath: "polygon(0 0, 100% 100%, 100% 0)" }}
      />

      <div className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <EigenCloudIcon className="h-4 w-4 text-purple" />
          <h3 className="font-mono text-xs font-bold uppercase tracking-widest text-muted">
            Verifiable Score
          </h3>
        </div>

        <p className="mb-4 text-[11px] leading-relaxed text-muted">
          Score computed in a TEE (Trusted Execution Environment) on EigenCompute.
          Cryptographically attested — the exact code that produced this score is verifiable.
        </p>

        {!data && !loading && !error && (
          <button
            onClick={verify}
            className="w-full py-2.5 text-center text-xs font-bold text-white transition-all hover:brightness-110"
            style={{
              background: "linear-gradient(90deg, #7c3aed 0%, #5b21b6 100%)",
              clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px))",
            }}
          >
            Verify Score via EigenCloud
          </button>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple/30 border-t-purple" />
            <span className="text-xs text-muted">Fetching from TEE...</span>
          </div>
        )}

        {error && (
          <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-400">
            <span className="font-medium">Not available:</span> {error}
            <button
              onClick={verify}
              className="mt-2 block w-full rounded border border-border py-1.5 text-center text-[10px] text-muted transition-colors hover:text-foreground"
            >
              Retry
            </button>
          </div>
        )}

        {data && (
          <div className="space-y-3">
            {/* Verified score display */}
            <div className="flex items-center justify-between rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <span className="text-xs font-bold text-green-400">TEE Verified</span>
              </div>
              <span className="font-mono text-lg font-bold text-foreground">
                {data.score.score}
              </span>
            </div>

            {/* Component breakdown */}
            <div className="space-y-1.5">
              {[
                { label: "Peer Reputation", value: data.score.components.peerReputation, max: 40 },
                { label: "Task Completion", value: data.score.components.taskCompletion, max: 30 },
                { label: "Economic Activity", value: data.score.components.economicActivity, max: 20 },
                { label: "Identity", value: data.score.components.identityCompleteness, max: 10 },
              ].map((c) => (
                <div key={c.label} className="flex items-center justify-between text-[11px]">
                  <span className="text-muted">{c.label}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-1 w-16 rounded-full bg-border">
                      <div
                        className="h-1 rounded-full bg-purple"
                        style={{ width: `${c.max > 0 ? (c.value / c.max) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="w-8 text-right font-mono font-medium text-foreground">
                      {c.value}/{c.max}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Attestation details (expandable) */}
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex w-full items-center justify-between rounded border border-border px-2 py-1.5 text-[10px] text-muted transition-colors hover:text-foreground"
            >
              <span>Attestation proof</span>
              <span>{expanded ? "▲" : "▼"}</span>
            </button>

            {expanded && (
              <div className="space-y-2 rounded-lg border border-border bg-background p-3 text-[10px]">
                <div>
                  <span className="block text-[9px] uppercase tracking-wider text-muted">TEE Signer</span>
                  <code className="font-mono text-foreground">{data.attestation.signer}</code>
                </div>
                <div>
                  <span className="block text-[9px] uppercase tracking-wider text-muted">Signature</span>
                  <code className="block break-all font-mono text-purple">
                    {data.attestation.signature.slice(0, 42)}...
                  </code>
                </div>
                <div>
                  <span className="block text-[9px] uppercase tracking-wider text-muted">Scoring Version</span>
                  <code className="font-mono text-foreground">v{data.score.version}</code>
                </div>
                <div>
                  <span className="block text-[9px] uppercase tracking-wider text-muted">Timestamp</span>
                  <code className="font-mono text-foreground">
                    {new Date(data.score.timestamp * 1000).toISOString()}
                  </code>
                </div>
                <a
                  href="https://docs.eigencloud.xyz/eigencompute/get-started/eigencompute-overview"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 flex items-center gap-1 text-purple transition-colors hover:underline"
                >
                  What is TEE verification? ↗
                </a>
              </div>
            )}

            <p className="text-center text-[9px] text-muted/60">
              Powered by{" "}
              <a href="https://eigencloud.xyz" target="_blank" rel="noopener noreferrer" className="text-purple hover:underline">
                EigenCloud
              </a>
              {" "}· Score computed in a Trusted Execution Environment
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
