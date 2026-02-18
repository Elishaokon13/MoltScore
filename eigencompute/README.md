# MoltScore Verifiable Scoring Service

Deterministic reputation scoring for AI agents, deployed on [EigenCompute](https://eigencloud.xyz) TEE.

## What it does

1. Reads on-chain agent data from Mandate Protocol (Identity, Reputation, Escrow)
2. Computes a deterministic reputation score (0–100)
3. Signs the result with the TEE-managed wallet
4. Returns score + cryptographic attestation

Anyone can verify the attestation to confirm the score was computed by this exact code running inside a Trusted Execution Environment.

## Scoring Components

| Component | Weight | Source |
|---|---|---|
| Peer Reputation | 40% | Reputation Registry (on-chain reviews) |
| Task Completion | 30% | Escrow mandate completions |
| Economic Activity | 20% | Total escrow value transacted |
| Identity Completeness | 10% | Metadata, skills, verification |

## API

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Service health + TEE wallet address |
| `/score/:agentId` | GET | Compute & sign a verifiable score |
| `/score` | POST | Score with pre-fetched input data |
| `/verify` | POST | Verify a signature against TEE wallet |

## Deploy to EigenCompute

```bash
npm install -g @layr-labs/ecloud-cli
ecloud auth login
ecloud compute app create --name moltscore-scoring --language typescript
cp .env.example .env
ecloud compute app deploy
```

## Local Development

```bash
npm install
npm run dev
```

Service runs on `http://localhost:3001`.
