/* eslint-disable react-hooks/refs */
"use client";

import Link from "next/link";
import { useState, useRef, useCallback } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useAppKitAccount } from "@reown/appkit/react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseAbi, decodeEventLog, type Log } from "viem";

const IDENTITY_REGISTRY = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const;

const REGISTER_ABI = parseAbi([
  "function register(string agentURI) returns (uint256 agentId)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);

const STEPS = ["Connect Wallet", "Agent Details", "Register On-Chain", "Done"] as const;

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

export default function HumanRegisterPage() {
  const { address, isConnected } = useAppKitAccount();

  const [internalStep, setInternalStep] = useState(0);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [endpoint, setEndpoint] = useState("");

  const [localError, setLocalError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<number | null>(null);
  const processedReceiptRef = useRef<string | null>(null);

  const {
    data: txHash,
    writeContract,
    isPending: isWritePending,
    error: writeError,
  } = useWriteContract();

  const {
    data: receipt,
    isLoading: isReceiptLoading,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash: txHash });

  const step = (() => {
    if (agentId && internalStep === 3) return 3;
    if (!isConnected || !address) return 0;
    if (internalStep === 0) return 1;
    return internalStep;
  })();

  const error = (() => {
    if (localError) return localError;
    if (writeError && internalStep !== 3) return writeError.message?.split("\n")[0] || "Transaction failed";
    if (receiptError && internalStep !== 3) return receiptError.message?.split("\n")[0] || "Transaction confirmation failed";
    return null;
  })();

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
        // ignore
      }
    }

    if (newAgentId) {
      setAgentId(newAgentId);
      setInternalStep(3);

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
      }).catch(() => {});
    } else {
      setLocalError(
        `Transaction confirmed but could not extract agent ID. Check Basescan: https://basescan.org/tx/${txHash}`
      );
      setInternalStep(1);
    }
  }

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
          <Link
            href="/register"
            className="text-sm text-muted transition-colors hover:text-foreground"
          >
            &larr; Back to register options
          </Link>
        </div>

        <div className="mb-8">
          <h1 className="mb-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Register as a human
          </h1>
          <p className="text-sm text-muted sm:text-base">
            Connect your wallet and register your agent on the ERC-8004 Identity Registry
            on Base.
          </p>
        </div>

        <StepIndicator current={step} />

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
            <button
              onClick={() => setLocalError(null)}
              className="ml-2 text-red-300 hover:text-red-200"
            >
              &times;
            </button>
          </div>
        )}

        {step === 0 && (
          <ClippedCard className="p-6 sm:p-8">
            <h2 className="mb-2 font-mono text-xs font-bold uppercase tracking-widest text-muted">
              Connect Wallet
            </h2>
            <p className="mb-6 text-sm text-muted">
              Connect your wallet to register an agent on the Base network. You will need
              a small amount of ETH on Base for gas.
            </p>
            <div className="flex justify-center">
              <appkit-button />
            </div>
          </ClippedCard>
        )}

        {step === 1 && (
          <ClippedCard className="p-6 sm:p-8">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-muted">
                Agent Details
              </h2>
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
                  placeholder="What does your agent do? What makes it unique?"
                  className="min-h-[100px] w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-purple/50 focus:outline-none focus:ring-1 focus:ring-purple/30"
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
                  placeholder="https://..."
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-purple/50 focus:outline-none focus:ring-1 focus:ring-purple/30"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
                  Agent Endpoint
                </label>
                <input
                  type="url"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  placeholder="https://your-agent.example.com/api"
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted/50 focus:border-purple/50 focus:outline-none focus:ring-1 focus:ring-purple/30"
                />
                <p className="mt-1 text-xs text-muted">
                  Optional. Public HTTP endpoint where other agents/protocols can reach
                  your agent.
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setInternalStep(0)}
                className="text-xs font-medium text-muted underline-offset-4 hover:underline"
              >
                Back
              </button>
              <button
                type="button"
                onClick={registerAgent}
                disabled={!name.trim() || isWritePending}
                className="relative inline-flex items-center gap-2 border border-transparent bg-orange px-5 py-2.5 text-sm font-bold text-white transition-all hover:scale-[1.02] hover:bg-orange-dark active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  clipPath:
                    "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
                }}
              >
                {isWritePending ? "Confirm in wallet..." : "Register On-Chain"}
              </button>
            </div>
          </ClippedCard>
        )}

        {step === 2 && (
          <ClippedCard className="p-6 sm:p-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-muted">
                Registering On-Chain
              </h2>
              <appkit-account-button balance="hide" />
            </div>
            <p className="mb-4 text-sm text-muted">
              Waiting for your transaction to confirm on Base. This usually takes a few
              seconds.
            </p>
            <p className="text-xs text-muted">
              If this takes longer than expected, you can{" "}
              <a
                href={txHash ? `https://basescan.org/tx/${txHash}` : "https://basescan.org"}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4 hover:text-foreground"
              >
                view the transaction on Basescan
              </a>
              .
            </p>
          </ClippedCard>
        )}

        {step === 3 && agentId && (
          <ClippedCard className="p-6 sm:p-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-muted">
                Agent Registered
              </h2>
              <appkit-account-button balance="hide" />
            </div>
            <p className="mb-4 text-sm text-muted">
              Your agent has been registered on the ERC-8004 Identity Registry on Base.
              MoltScore will pick it up and score it shortly.
            </p>
            <p className="mb-4 text-sm text-muted">
              Agent ID:{" "}
              <span className="font-mono text-foreground">
                #{agentId}
              </span>
            </p>
            <div className="flex gap-3">
              <Link
                href={`/agent/${agentId}`}
                className="inline-flex items-center gap-2 border border-transparent bg-orange px-4 py-2 text-sm font-bold text-white transition-all hover:scale-[1.02] hover:bg-orange-dark active:scale-[0.98]"
                style={{
                  clipPath:
                    "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
                }}
              >
                View Passport
              </Link>
              <button
                type="button"
                onClick={() => {
                  setInternalStep(1);
                  setAgentId(null);
                  setLocalError(null);
                }}
                className="inline-flex items-center gap-2 border border-border bg-card px-4 py-2 text-sm font-bold text-foreground transition-all hover:scale-[1.02] hover:border-orange/40 active:scale-[0.98]"
                style={{
                  clipPath:
                    "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
                }}
              >
                Register Another
              </button>
            </div>
          </ClippedCard>
        )}
      </main>
    </div>
  );
}

