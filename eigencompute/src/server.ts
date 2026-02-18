/**
 * MoltScore Verifiable Scoring Service
 *
 * Runs on EigenCompute inside a TEE. Exposes an HTTP API that:
 * 1. Reads on-chain agent data from Mandate Protocol
 * 2. Computes a deterministic reputation score
 * 3. Signs the result with the TEE-managed wallet
 * 4. Returns the score + signature for on-chain/off-chain verification
 *
 * The TEE attestation proves this exact code produced the score.
 */

import express from "express";
import { ethers } from "ethers";
import { computeScore, fetchScoreInput, type ScoreOutput } from "./scoring";

// BigInt → string so JSON.stringify works with on-chain values
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

const app = express();
const PORT = parseInt(process.env.APP_PORT || "3001", 10);
const RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";

// TEE wallet — mnemonic is injected by EigenCompute KMS at runtime
const MNEMONIC = process.env.MNEMONIC || "";

let signer: ethers.Signer & { address: string } | null = null;
let provider: ethers.JsonRpcProvider;

function getSigner(): ethers.Signer & { address: string } {
  if (!signer) {
    if (MNEMONIC) {
      const hd = ethers.HDNodeWallet.fromPhrase(MNEMONIC).connect(provider);
      signer = hd;
    } else {
      const rnd = ethers.Wallet.createRandom().connect(provider);
      console.warn("[TEE] No MNEMONIC — using random dev wallet:", rnd.address);
      signer = rnd;
    }
  }
  return signer!;
}

/* ---------- Attestation signing ---------- */

interface SignedAttestation {
  score: ScoreOutput;
  attestation: {
    signer: string;
    signature: string;
    message: string;
    timestamp: number;
  };
}

async function signScore(score: ScoreOutput): Promise<SignedAttestation> {
  const wallet = getSigner();

  // Create a deterministic message from the score
  const message = JSON.stringify({
    agentId: score.agentId,
    score: score.score,
    components: score.components,
    timestamp: score.timestamp,
    version: score.version,
  });

  const signature = await wallet.signMessage(message);

  return {
    score,
    attestation: {
      signer: wallet.address,
      signature,
      message,
      timestamp: Math.floor(Date.now() / 1000),
    },
  };
}

/* ---------- Routes ---------- */

app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  const wallet = getSigner();
  res.json({
    status: "ok",
    service: "moltscore-verifiable-scoring",
    version: "1.0.0",
    teeWallet: wallet.address,
    network: "base",
    rpc: RPC_URL.replace(/\/[^/]*$/, "/***"),
  });
});

// Score a single agent
app.get("/score/:agentId", async (req, res) => {
  const agentId = parseInt(req.params.agentId, 10);
  if (isNaN(agentId) || agentId < 0) {
    return res.status(400).json({ error: "Invalid agentId" });
  }

  try {
    const input = await fetchScoreInput(provider, agentId);
    const score = computeScore(input);
    const attestation = await signScore(score);

    return res.json({
      success: true,
      ...attestation,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error(`[Score] Agent ${agentId} failed:`, message);
    return res.status(500).json({ error: message });
  }
});

// Score with pre-fetched input (for batch scoring from MoltScore sync)
app.post("/score", async (req, res) => {
  const { agentId, feedbackCount, feedbackValue, completedMandates, totalMandates, totalEscrowWei, hasMetadata, hasSkills, ownerVerified } = req.body;

  if (typeof agentId !== "number") {
    return res.status(400).json({ error: "agentId required" });
  }

  try {
    const input = {
      agentId,
      feedbackCount: feedbackCount ?? 0,
      feedbackValue: feedbackValue ?? 0,
      completedMandates: completedMandates ?? 0,
      totalMandates: totalMandates ?? 0,
      totalEscrowWei: BigInt(totalEscrowWei ?? "0"),
      hasMetadata: hasMetadata ?? false,
      hasSkills: hasSkills ?? false,
      ownerVerified: ownerVerified ?? false,
    };

    const score = computeScore(input);
    const attestation = await signScore(score);

    return res.json({
      success: true,
      ...attestation,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return res.status(500).json({ error: message });
  }
});

// Verify a signature (for anyone to independently verify)
app.post("/verify", (req, res) => {
  const { message, signature } = req.body;
  if (!message || !signature) {
    return res.status(400).json({ error: "message and signature required" });
  }

  try {
    const recovered = ethers.verifyMessage(message, signature);
    const wallet = getSigner();
    const valid = recovered.toLowerCase() === wallet.address.toLowerCase();

    return res.json({
      valid,
      recoveredAddress: recovered,
      expectedAddress: wallet.address,
    });
  } catch {
    return res.json({ valid: false, error: "Invalid signature" });
  }
});

/* ---------- Start ---------- */

provider = new ethers.JsonRpcProvider(RPC_URL);

app.listen(PORT, "0.0.0.0", () => {
  const wallet = getSigner();
  console.log(`
╔══════════════════════════════════════════════════╗
║  MoltScore Verifiable Scoring Service            ║
║  Running on EigenCompute TEE                     ║
╠══════════════════════════════════════════════════╣
║  Port:    ${String(PORT).padEnd(39)}║
║  Wallet:  ${wallet.address.slice(0, 20)}...${String("").padEnd(15)}║
║  Network: Base Mainnet${String("").padEnd(27)}║
║  RPC:     ${RPC_URL.slice(0, 38).padEnd(39)}║
╚══════════════════════════════════════════════════╝
  `);
});
