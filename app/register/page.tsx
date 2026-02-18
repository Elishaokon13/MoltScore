/* eslint-disable react-hooks/refs */
"use client";

import Link from "next/link";
import { useState, useRef, useCallback } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useAppKitAccount } from "@reown/appkit/react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseAbi, decodeEventLog, type Log } from "viem";

/* ---------- Contract ---------- */

const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;

const REGISTER_ABI = parseAbi([
  "function register(string agentURI) returns (uint256 agentId)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);

/* ---------- Constants ---------- */

const STEPS = ["Connect Wallet", "Agent Details", "Register On-Chain", "Done"] as const;

/* ---------- Sub-components ---------- */

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="mb-8 flex items-center justify-center gap-2">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center font-mono text-xs font-bold transition-colors ${
              i < current
                ? "bg-green-500 text-white"
                : i === current
                  ? "bg-orange text-white"
                  : "border border-border bg-card text-muted"
            }`}
            style={{
              clipPath: "polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px))",
            }}
          >
            {i < current ? "✓" : i + 1}
          </div>
          <span className={`hidden text-xs sm:inline ${i === current ? "font-medium text-foreground" : "text-muted"}`}>
            {label}
          </span>
          {i < STEPS.length - 1 && <div className="mx-1 h-px w-6 bg-border sm:w-10" />}
        </div>
      ))}
    </div>
  );
}

function ClippedCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative border border-border bg-card ${className}`}
      style={{
        clipPath: "polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px))",
      }}
    >
      <div
        className="absolute top-0 right-0 h-5 w-5 bg-purple/30"
        style={{ clipPath: "polygon(0 0, 100% 100%, 100% 0)" }}
      />
      {children}
    </div>
  );
}

/* ---------- Main Page ---------- */

export default function RegisterPage() {
  const { address, isConnected } = useAppKitAccount();

  // Internal step tracks user-driven progression (0=initial, 1=form, 2=pending, 3=done)
  const [internalStep, setInternalStep] = useState(0);

  // Form fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [endpoint, setEndpoint] = useState("");

  // Registration state
  const [localError, setLocalError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<number | null>(null);
  const processedReceiptRef = useRef<string | null>(null);

  // wagmi write contract
  const {
    data: txHash,
    writeContract,
    isPending: isWritePending,
    error: writeError,
  } = useWriteContract();

  // Wait for receipt
  const {
    data: receipt,
    isLoading: isReceiptLoading,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash: txHash });

  // Derive effective step from connection + internal state
  const step = (() => {
    if (agentId && internalStep === 3) return 3;
    if (!isConnected || !address) return 0;
    if (internalStep === 0) return 1; // auto-advance when connected
    return internalStep;
  })();

  // Derive error from all sources
  const error = (() => {
    if (localError) return localError;
    if (writeError && internalStep !== 3) return writeError.message?.split("\n")[0] || "Transaction failed";
    if (receiptError && internalStep !== 3) return receiptError.message?.split("\n")[0] || "Transaction confirmation failed";
    return null;
  })();

  // Process receipt when it arrives (idempotent via ref)
  if (receipt && receipt.transactionHash !== processedReceiptRef.current) {
    processedReceiptRef.current = receipt.transactionHash;

    let newAgentId: number | null = null;
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: REGISTER_ABI,
          data: log.data,
          topics: (log as unknown as Log).topics,
        });
        if (decoded.eventName === "Registered" && decoded.args) {
          const args = decoded.args as { agentId: bigint };
          newAgentId = Number(args.agentId);
          break;
        }
      } catch {
        // Not our event
      }
    }

    if (newAgentId) {
      setAgentId(newAgentId);
      setInternalStep(3);

      // Cache in our DB
      fetch("/api/agent/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: newAgentId,
          owner: address,
          name: name.trim(),
          description: description.trim() || null,
          image: imageUrl.trim() || null,
          endpoint: endpoint.trim() || null,
        }),
      }).catch(() => { /* sync script will pick it up */ });
    } else {
      setLocalError(
        `Transaction confirmed but could not extract agent ID. Check Basescan: https://basescan.org/tx/${txHash}`
      );
      setInternalStep(1);
    }
  }

  // Register on-chain
  const registerAgent = useCallback(() => {
    if (!isConnected || !address || !name.trim()) return;
    setLocalError(null);
    setInternalStep(2);

    const metadata: Record<string, string> = { name: name.trim() };
    if (description.trim()) metadata.description = description.trim();
    if (imageUrl.trim()) metadata.image = imageUrl.trim();
    if (endpoint.trim()) metadata.endpoint = endpoint.trim();

    const agentURI = `data:application/json,${encodeURIComponent(JSON.stringify(metadata))}`;

    writeContract({
      address: IDENTITY_REGISTRY,
      abi: REGISTER_ABI,
      functionName: "register",
      args: [agentURI],
    });
  }, [isConnected, address, name, description, imageUrl, endpoint, writeContract]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppHeader activePath="/register" ctaLabel="Register" ctaHref="/register" />

      <main className="mx-auto max-w-2xl px-4 py-6 sm:py-8 md:px-8">
        <div className="mb-6">
          <Link href="/agents" className="text-sm text-muted transition-colors hover:text-foreground">&larr; Back to agents</Link>
        </div>

        <div className="mb-8">
          <h1 className="mb-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Register Agent</h1>
          <p className="text-sm text-muted sm:text-base">Register your AI agent on-chain via the ERC-8004 Identity Registry on Base.</p>
        </div>

        <StepIndicator current={step} />

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
            <button onClick={() => setLocalError(null)} className="ml-2 text-red-300 hover:text-red-200">&times;</button>
          </div>
        )}

        {/* Step 0: Connect Wallet via Reown AppKit */}
        {step === 0 && (
          <ClippedCard className="p-6 sm:p-8">
            <h2 className="mb-2 font-mono text-xs font-bold uppercase tracking-widest text-muted">Connect Wallet</h2>
            <p className="mb-6 text-sm text-muted">
              Connect your wallet to register an agent on the Base network. You will need a small amount of ETH on Base for gas.
            </p>

            <div className="flex justify-center">
              <appkit-button />
            </div>
          </ClippedCard>
        )}

        {/* Step 1: Agent Details Form */}
        {step === 1 && (
          <ClippedCard className="p-6 sm:p-8">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-muted">Agent Details</h2>
              <appkit-account-button balance="hide" />
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
                  Agent Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. CodeAuditBot"
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-purple/50 focus:outline-none focus:ring-1 focus:ring-purple/30"
                  maxLength={100}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What does your agent do?"
                  rows={3}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-purple/50 focus:outline-none focus:ring-1 focus:ring-purple/30"
                  maxLength={500}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
                  Image URL
                </label>
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://example.com/agent-avatar.png"
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-purple/50 focus:outline-none focus:ring-1 focus:ring-purple/30"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
                  MCP / A2A Endpoint <span className="text-muted/50">(optional)</span>
                </label>
                <input
                  type="url"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="https://mcp.example.com/"
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-purple/50 focus:outline-none focus:ring-1 focus:ring-purple/30"
                />
                <p className="mt-1 text-[10px] text-muted">Your agent&apos;s MCP or A2A endpoint for discoverability.</p>
              </div>
            </div>

            <div className="mt-8 flex items-center gap-3">
              <button
                onClick={() => setInternalStep(0)}
                className="rounded-lg border border-border px-4 py-2.5 text-sm text-muted transition-colors hover:text-foreground"
              >
                Back
              </button>
              <button
                onClick={registerAgent}
                disabled={!name.trim() || isWritePending}
                className="flex-1 py-3 text-center font-bold text-white transition-all hover:brightness-110 disabled:opacity-40"
                style={{
                  background: "linear-gradient(90deg, var(--orange) 0%, var(--orange-dark) 100%)",
                  clipPath: "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
                }}
              >
                {isWritePending ? "Confirm in Wallet..." : "Register On-Chain →"}
              </button>
            </div>

            <p className="mt-4 text-center text-[10px] text-muted">
              This will submit a transaction on Base. Gas fees apply.
              Powered by <a href="https://sdk.ag0.xyz" target="_blank" rel="noopener noreferrer" className="text-purple hover:underline">ERC-8004</a> Identity Registry.
            </p>
          </ClippedCard>
        )}

        {/* Step 2: Registering */}
        {step === 2 && (
          <ClippedCard className="p-6 text-center sm:p-8">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-purple/30 border-t-purple" />
            <h2 className="mb-2 text-lg font-bold text-foreground">
              {isReceiptLoading ? "Confirming Transaction..." : "Waiting for Wallet..."}
            </h2>
            <p className="text-sm text-muted">
              {isReceiptLoading
                ? "Your transaction has been submitted. Waiting for on-chain confirmation."
                : "Please confirm the transaction in your wallet. This registers your agent on the ERC-8004 Identity Registry on Base."}
            </p>
            {txHash && (
              <p className="mt-3 text-xs text-muted">
                Tx:{" "}
                <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="font-mono text-purple hover:underline">
                  {txHash.slice(0, 10)}...{txHash.slice(-8)}
                </a>
              </p>
            )}
          </ClippedCard>
        )}

        {/* Step 3: Success */}
        {step === 3 && agentId && (
          <ClippedCard className="p-6 sm:p-8">
            <div className="mb-4 flex items-center justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
                <svg className="h-8 w-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <h2 className="mb-2 text-center text-xl font-bold text-foreground">Agent Registered!</h2>
            <p className="mb-6 text-center text-sm text-muted">
              Your agent <span className="font-bold text-foreground">{name}</span> has been registered on-chain with ID{" "}
              <span className="font-mono font-bold text-orange">#{agentId}</span>.
            </p>

            {txHash && (
              <div className="mb-6 rounded-lg border border-border bg-background p-3 text-center">
                <p className="mb-1 text-[10px] uppercase tracking-wider text-muted">Transaction</p>
                <a
                  href={`https://basescan.org/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-xs text-purple hover:underline"
                >
                  {txHash.slice(0, 10)}...{txHash.slice(-8)}
                </a>
              </div>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href={`/agent/${agentId}`}
                className="flex-1 py-3 text-center font-bold text-white transition-all hover:brightness-110"
                style={{
                  background: "linear-gradient(90deg, var(--orange) 0%, var(--orange-dark) 100%)",
                  clipPath: "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
                }}
              >
                View Agent Profile →
              </Link>
              <Link
                href="/agents"
                className="flex-1 rounded-lg border border-border py-3 text-center text-sm font-medium text-muted transition-colors hover:text-foreground"
              >
                Browse All Agents
              </Link>
            </div>

            <p className="mt-6 text-center text-[10px] text-muted">
              Your agent will appear in the directory after the next sync cycle. It may take a few minutes to be fully indexed.
            </p>
          </ClippedCard>
        )}

        {/* Info box */}
        <div className="mt-8 rounded-lg border border-dashed border-border p-4 sm:p-5">
          <h3 className="mb-2 font-mono text-xs font-bold uppercase tracking-widest text-muted">What is ERC-8004?</h3>
          <p className="mb-3 text-xs leading-relaxed text-muted">
            ERC-8004 is the open standard for AI agent identity, co-authored with the Ethereum Foundation, Google, and Coinbase.
            It gives your agent a portable, on-chain identity with verifiable reputation.
          </p>
          <div className="flex flex-wrap gap-2">
            <a href="https://sdk.ag0.xyz/docs" target="_blank" rel="noopener noreferrer" className="rounded border border-border px-2.5 py-1 text-[10px] font-medium text-muted transition-colors hover:text-foreground">
              Agent0 SDK Docs ↗
            </a>
            <a href="https://eips.ethereum.org/EIPS/eip-8004" target="_blank" rel="noopener noreferrer" className="rounded border border-border px-2.5 py-1 text-[10px] font-medium text-muted transition-colors hover:text-foreground">
              ERC-8004 Spec ↗
            </a>
            <a href="https://www.8004.org/" target="_blank" rel="noopener noreferrer" className="rounded border border-border px-2.5 py-1 text-[10px] font-medium text-muted transition-colors hover:text-foreground">
              Ecosystem ↗
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
