"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { AppHeader } from "@/components/AppHeader";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  parseAbi,
  decodeEventLog,
  type Address,
  type Hash,
  type Log,
} from "viem";
import { base } from "viem/chains";

/* ---------- Contract ---------- */

const IDENTITY_REGISTRY: Address = "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432";

const REGISTER_ABI = parseAbi([
  "function register(string agentURI) returns (uint256 agentId)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
]);

/* ---------- Constants ---------- */

const BASE_CHAIN_ID_HEX = "0x2105"; // 8453

const STEPS = ["Connect Wallet", "Agent Details", "Register On-Chain", "Done"] as const;

/* ---------- Types ---------- */

type EIP1193Provider = {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

type ProviderInfo = { uuid: string; name: string; icon: string; rdns: string };
type ProviderDetail = { info: ProviderInfo; provider: EIP1193Provider };

/* ---------- ERC-6963 discovery (inline, no SDK dep) ---------- */

function discoverProviders(timeoutMs = 400): Promise<ProviderDetail[]> {
  if (typeof window === "undefined") return Promise.resolve([]);
  return new Promise((resolve) => {
    const providers: ProviderDetail[] = [];
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as ProviderDetail | undefined;
      if (detail?.info && detail?.provider) providers.push(detail);
    };
    window.addEventListener("eip6963:announceProvider", handler);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", handler);
      resolve(providers);
    }, timeoutMs);
  });
}

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
  const [step, setStep] = useState(0);
  const [wallets, setWallets] = useState<ProviderDetail[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<ProviderDetail | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Form fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [endpoint, setEndpoint] = useState("");

  // Registration state
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<number | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // Discover wallets via ERC-6963
  useEffect(() => {
    let cancelled = false;
    discoverProviders().then((providers) => {
      if (!cancelled) setWallets(providers);
    });
    return () => { cancelled = true; };
  }, []);

  // Connect wallet
  const connectWallet = useCallback(async (detail: ProviderDetail) => {
    setConnecting(true);
    setError(null);
    try {
      // Ensure we're on Base
      try {
        await detail.provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: BASE_CHAIN_ID_HEX }],
        });
      } catch (switchErr: unknown) {
        const err = switchErr as { code?: number };
        if (err.code === 4902) {
          await detail.provider.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: BASE_CHAIN_ID_HEX,
              chainName: "Base",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://mainnet.base.org"],
              blockExplorerUrls: ["https://basescan.org"],
            }],
          });
        }
      }

      const accounts = (await detail.provider.request({
        method: "eth_requestAccounts",
      })) as string[];

      if (accounts?.[0]) {
        setSelectedWallet(detail);
        setAccount(accounts[0]);
        setStep(1);
      } else {
        setError("No account returned. Please unlock your wallet.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect wallet");
    } finally {
      setConnecting(false);
    }
  }, []);

  // Register agent on-chain via viem
  const registerAgent = useCallback(async () => {
    if (!selectedWallet || !account || !name.trim()) return;
    setRegistering(true);
    setError(null);
    setStep(2);

    try {
      const walletClient = createWalletClient({
        chain: base,
        transport: custom(selectedWallet.provider),
        account: account as Address,
      });

      const publicClient = createPublicClient({
        chain: base,
        transport: http("https://mainnet.base.org"),
      });

      // Build agent metadata URI (data URI with JSON)
      const metadata: Record<string, string> = { name: name.trim() };
      if (description.trim()) metadata.description = description.trim();
      if (imageUrl.trim()) metadata.image = imageUrl.trim();
      if (endpoint.trim()) metadata.endpoint = endpoint.trim();

      const agentURI = `data:application/json,${encodeURIComponent(JSON.stringify(metadata))}`;

      // Call register(agentURI) on the Identity Registry
      const hash: Hash = await walletClient.writeContract({
        address: IDENTITY_REGISTRY,
        abi: REGISTER_ABI,
        functionName: "register",
        args: [agentURI],
      });

      setTxHash(hash);

      // Wait for receipt
      const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });

      // Extract agentId from the Registered event
      let newAgentId: number | null = null;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: REGISTER_ABI,
            data: log.data,
            topics: (log as Log).topics,
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

      if (!newAgentId) {
        throw new Error(
          "Transaction confirmed but could not extract agent ID from logs. " +
          `Check Basescan: https://basescan.org/tx/${hash}`
        );
      }

      setAgentId(newAgentId);

      // Cache in our DB so the agent appears immediately
      try {
        await fetch("/api/agent/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: newAgentId,
            owner: account,
            name: name.trim(),
            description: description.trim() || null,
            image: imageUrl.trim() || null,
            endpoint: endpoint.trim() || null,
          }),
        });
      } catch {
        // Non-critical — sync script will pick it up later
      }

      setStep(3);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Registration failed";
      setError(msg);
      setStep(1); // Go back to form
    } finally {
      setRegistering(false);
    }
  }, [selectedWallet, account, name, description, imageUrl, endpoint]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <AppHeader activePath="/register" ctaLabel="Register" ctaHref="/register" />

      <main className="mx-auto max-w-2xl px-4 py-8 md:px-8">
        <div className="mb-6">
          <Link href="/agents" className="text-sm text-muted transition-colors hover:text-foreground">&larr; Back to agents</Link>
        </div>

        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-foreground">Register Agent</h1>
          <p className="text-muted">Register your AI agent on-chain via the ERC-8004 Identity Registry on Base.</p>
        </div>

        <StepIndicator current={step} />

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Step 0: Connect Wallet */}
        {step === 0 && (
          <ClippedCard className="p-6 sm:p-8">
            <h2 className="mb-2 font-mono text-xs font-bold uppercase tracking-widest text-muted">Connect Wallet</h2>
            <p className="mb-6 text-sm text-muted">
              Connect your wallet to register an agent on the Base network. You will need a small amount of ETH on Base for gas.
            </p>

            {wallets.length > 0 ? (
              <div className="space-y-3">
                {wallets.map((w) => (
                  <button
                    key={w.info.uuid}
                    onClick={() => connectWallet(w)}
                    disabled={connecting}
                    className="flex w-full items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 text-left transition-colors hover:border-purple/40 hover:bg-card disabled:opacity-50"
                  >
                    {w.info.icon && (
                      <img src={w.info.icon} alt="" className="h-8 w-8 rounded-lg" />
                    )}
                    <div className="flex-1">
                      <span className="text-sm font-medium text-foreground">{w.info.name}</span>
                      <span className="block text-xs text-muted">{w.info.rdns}</span>
                    </div>
                    {connecting && (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-purple/30 border-t-purple" />
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-background p-6 text-center">
                <p className="mb-2 text-sm font-medium text-foreground">No wallet detected</p>
                <p className="mb-4 text-xs text-muted">Install a browser wallet like MetaMask or Coinbase Wallet to continue.</p>
                <a
                  href="https://metamask.io/download/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-lg bg-orange px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-orange-dark"
                >
                  Get MetaMask
                </a>
              </div>
            )}
          </ClippedCard>
        )}

        {/* Step 1: Agent Details Form */}
        {step === 1 && (
          <ClippedCard className="p-6 sm:p-8">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-muted">Agent Details</h2>
              <span className="rounded bg-green-500/20 px-2 py-0.5 font-mono text-[10px] text-green-400">
                {account?.slice(0, 6)}...{account?.slice(-4)}
              </span>
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
                onClick={() => { setStep(0); setAccount(null); setSelectedWallet(null); }}
                className="rounded-lg border border-border px-4 py-2.5 text-sm text-muted transition-colors hover:text-foreground"
              >
                Back
              </button>
              <button
                onClick={registerAgent}
                disabled={!name.trim() || registering}
                className="flex-1 py-3 text-center font-bold text-white transition-all hover:brightness-110 disabled:opacity-40"
                style={{
                  background: "linear-gradient(90deg, var(--orange) 0%, var(--orange-dark) 100%)",
                  clipPath: "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 12px 100%, 0 calc(100% - 12px))",
                }}
              >
                {registering ? "Registering..." : "Register On-Chain →"}
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
            <h2 className="mb-2 text-lg font-bold text-foreground">Registering On-Chain</h2>
            <p className="text-sm text-muted">
              Please confirm the transaction in your wallet. This registers your agent on the ERC-8004 Identity Registry on Base.
            </p>
            {txHash && (
              <p className="mt-3 text-xs text-muted">
                Tx submitted:{" "}
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
        <div className="mt-8 rounded-lg border border-dashed border-border p-5">
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
