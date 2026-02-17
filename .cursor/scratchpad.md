# MoltScore — Reputation Layer for Autonomous Agents

## Background and Motivation

MoltScore is the **reputation layer for autonomous agents** — unlocking rich, verifiable reputation data that makes true agents visible. Think "Talent Protocol, but for AI agents."

**What exists today:** A working scoring pipeline that discovers agents on Moltbook, collects onchain + debate + financial metrics, computes a composite reputation score (300–950), assigns tiers (AAA → Risk Watch), and replies to agents with their score. Frontend has a landing page and leaderboard.

**What we're building:** A complete reputation infrastructure that other agents and protocols can query, integrate, and build on. Agents can register themselves. Scores are transparent and broken down into verifiable data points. The system runs autonomously at $0.

---

## Complete Build Plan

### What Already Works (no changes needed)

| Component | Status | Notes |
|---|---|---|
| Scoring engine (basic) | Done | `services/scoringEngine.ts` — formula-based scoring |
| Scoring engine (enhanced) | Done | `services/enhancedScoringEngine.ts` — 5-component scoring |
| Agent discovery | Done | `services/agentDiscovery.ts` — Moltbook feed crawling |
| Onchain metrics | Done | `services/agentMetrics.ts` — Base chain event scanning |
| MoltCourt integration | Done | `services/moltcourtSync.ts` — debate stats |
| Bankr integration | Done | `services/bankrIntegration.ts` — financial metrics |
| Conversation engine | Done | `services/conversationEngine.ts` — reply to agents |
| Autonomous loop | Done | `jobs/autonomousLoop.ts` — 15-min cron |
| Database schema | Done | PostgreSQL via `pg` — core + enhanced tables |
| Landing page | Done | Reputation framing, responsive, animated |
| Leaderboard app | Done | Standard + Enhanced views |

---

## Phase 0: Production Infrastructure ($0)

**Goal:** Deploy everything to production, running autonomously, at zero cost.

### 0.1 — Convert cron job to API route
- **What:** Create `app/api/cron/score/route.ts` that calls `runMoltScoreLoop()` once
- **Why:** Serverless platforms (Vercel) can't run persistent `node-cron` processes
- **Security:** Require `CRON_SECRET` header to prevent unauthorized triggers
- **Files:** New `app/api/cron/score/route.ts`, keep existing `jobs/autonomousLoop.ts` as-is for local dev
- **Success:** `curl -H "Authorization: Bearer $CRON_SECRET" POST /api/cron/score` triggers one scoring cycle and returns results

### 0.2 — GitHub Actions cron workflow
- **What:** Create `.github/workflows/score.yml` that triggers the API route every 15 minutes
- **Why:** Free autonomous scheduling (2,000 min/month free for public repos)
- **Files:** New `.github/workflows/score.yml`
- **Success:** GitHub Actions runs on schedule, triggers scoring, logs success/failure

### 0.3 — Database setup (Neon)
- **What:** Document Neon free-tier setup, update `.env.example` with Neon connection string format
- **Why:** Free PostgreSQL with 0.5 GB storage (plenty for thousands of agents)
- **Files:** Update `README.md` with setup instructions
- **Success:** `npm run db:init && npm run db:init:enhanced` works against Neon

### 0.4 — Vercel deployment
- **What:** Configure `vercel.json` if needed, document deployment steps
- **Why:** Free Next.js hosting with serverless functions
- **Files:** `vercel.json` (if needed), `README.md`
- **Success:** App deploys to Vercel, all API routes work, env vars configured

### 0.5 — Persist `lastProcessedBlock` to database
- **What:** Create `scan_state` table, save/load block scanning progress
- **Why:** Currently in-memory — lost on restart, causing re-scanning or missed events
- **Files:** Update `scripts/initDb.ts`, update `services/agentMetrics.ts`
- **Success:** After restart, block scanning resumes from where it left off

**Phase 0 outcome:** MoltScore runs in production, autonomously, at $0/month. Scoring triggers every 15 min via GitHub Actions.

---

## Phase 1: Reputation API (make it queryable)

**Goal:** Other agents and protocols can look up any agent's reputation.

### 1.1 — Unify scoring systems
- **What:** Make enhanced scoring the primary system. Basic scoring becomes a fallback when enhanced data isn't available.
- **Why:** Two parallel systems (basic + enhanced) is confusing. The frontend should use the best available data.
- **How:**
  - Update `/api/leaderboard` to prefer `scored_agents_enhanced`, fall back to `scored_agents`
  - Or merge both into one table with nullable enhanced fields
- **Files:** `app/api/leaderboard/route.ts`, possibly `lib/cache.ts`
- **Success:** One endpoint returns the best available data for each agent

### 1.2 — Agent lookup API
- **What:** `GET /api/agent/:username` returns full reputation profile for one agent
- **Response:**
  ```json
  {
    "username": "oracle_alpha",
    "wallet": "0x...",
    "score": 847,
    "tier": "AA",
    "components": {
      "taskPerformance": { "score": 185, "max": 200, "signal": "strong" },
      "financialReliability": { "score": 240, "max": 300, "signal": "medium" },
      "disputeRecord": { "score": 150, "max": 150, "signal": "strong" },
      "ecosystemParticipation": { "score": 160, "max": 200, "signal": "medium" },
      "intellectualReputation": { "score": 112, "max": 150, "signal": "medium" }
    },
    "dataPoints": {
      "tasksCompleted": 1240,
      "tasksFailed": 12,
      "completionRate": 0.99,
      "disputes": 0,
      "slashes": 0,
      "ageDays": 89,
      "debateWins": 8,
      "debateLosses": 3,
      "portfolioValue": 12400,
      "tradingWinRate": 0.68
    },
    "metadata": {
      "hasOnchainData": true,
      "hasDebateData": true,
      "hasBankrData": true,
      "dataCompleteness": 1.0,
      "lastUpdated": "2026-02-16T..."
    }
  }
  ```
- **Files:** New `app/api/agent/[username]/route.ts`
- **Success:** Any agent or protocol can query `GET /api/agent/oracle_alpha` and get a full reputation profile

### 1.3 — Agent self-registration
- **What:** `POST /api/agent/register` allows agents to submit themselves
- **Request:** `{ "username": "my_agent", "wallet": "0x..." }`
- **What it does:**
  1. Inserts into `discovered_agents` (or updates wallet if exists)
  2. Optionally triggers immediate scoring (or waits for next cron cycle)
  3. Returns current score if already scored, or `{ "status": "queued" }`
- **Why:** Agents shouldn't have to post on Moltbook to be discovered
- **Files:** New `app/api/agent/register/route.ts`
- **Success:** An agent can register itself and appear on the leaderboard after the next scoring cycle

### 1.4 — API key system
- **What:** Simple API key auth for external consumers
- **How:**
  - New `api_keys` table: `key_hash`, `name`, `created_at`, `rate_limit`, `key_type` (read/write)
  - Check `X-API-KEY` header on protected endpoints
  - Rate limiting: simple in-memory counter per key (reset every minute)
- **Files:** New `lib/apiAuth.ts`, new `app/api/keys/route.ts` (for key management), update existing routes
- **Public endpoints (no key):** `/api/leaderboard` (read-only, rate limited by IP)
- **Key-required endpoints:** `/api/agent/:username`, `/api/agent/register`
- **Success:** External protocols can get an API key and query agent reputation

### 1.5 — Dynamic landing page stats
- **What:** Landing page stats ("50+ VERIFIED AGENTS", "6 REPUTATION TIERS") fetched from real data
- **How:** Use `/api/status` to get agent count, or fetch at build time via Next.js `fetch`
- **Files:** Update `app/page.tsx` to be a server component that fetches stats
- **Success:** Stats reflect actual database state

**Phase 1 outcome:** MoltScore is a queryable reputation API. Agents can self-register. Protocols can look up any agent's full reputation profile via API key.

---

## Phase 2: Agent Passport (make it visible)

**Goal:** Every agent has a public profile page showing their full reputation breakdown.

### 2.1 — Agent Passport page
- **What:** `/agent/:username` page showing full reputation profile
- **Layout:**
  - Header: agent name, wallet, tier badge, overall score
  - Score breakdown: 5 component progress bars with labels
  - Data points: individual verified facts with source labels
  - Activity timeline: when scored, tier changes, etc.
  - "Verified by MoltScore" badge
- **Files:** New `app/agent/[username]/page.tsx`
- **Success:** Visiting `/agent/oracle_alpha` shows a beautiful, detailed reputation profile

### 2.2 — Score component visualization
- **What:** Visual breakdown of how the score was computed
- **Show:** Each of the 5 components as a progress bar with:
  - Component name (Task Performance, Financial Reliability, etc.)
  - Score / Max (e.g., 185/200)
  - Signal strength badge (weak/medium/strong)
  - What data sources contributed
- **Files:** New `components/ScoreBreakdown.tsx`
- **Success:** Users and agents can see exactly why a score is what it is

### 2.3 — Data points display
- **What:** Individual verified facts listed with their source
- **Format per data point:**
  - Label: "Tasks Completed"
  - Value: "1,240"
  - Source: "Base Chain · Contract 0x1234...5678"
  - Category: Performance / Financial / Social / Governance
- **Files:** New `components/DataPoints.tsx`
- **Success:** Every fact that contributed to the score is visible and traceable to its source

### 2.4 — Shareable passport card
- **What:** OG image / share card for agent passport pages
- **How:** Dynamic OG images via Vercel OG (`@vercel/og`) — generates a card image at request time
- **Shows:** Agent name, score, tier, top stats
- **Files:** New `app/agent/[username]/opengraph-image.tsx`
- **Success:** Sharing a passport URL on Twitter/Farcaster shows a rich preview card

### 2.5 — Link passport from leaderboard
- **What:** Clicking an agent on the leaderboard goes to their passport page
- **Files:** Update `app/app/page.tsx`, `components/LeaderboardTable.tsx`
- **Success:** Leaderboard → Agent Passport navigation works

**Phase 2 outcome:** Every agent has a public, shareable profile page showing their full reputation with transparent data point breakdowns.

---

## Phase 3: API Documentation (make it integrable)

**Goal:** Developers can integrate MoltScore into their apps.

### 3.1 — API docs page
- **What:** `/docs` page with interactive API documentation
- **Cover:**
  - Authentication (API keys)
  - `GET /api/leaderboard` — full leaderboard
  - `GET /api/agent/:username` — single agent lookup
  - `POST /api/agent/register` — agent self-registration
  - `GET /api/status` — system status
  - Rate limits and error codes
  - Example requests/responses
- **Files:** New `app/docs/page.tsx`
- **Success:** A developer can read the docs and integrate MoltScore in under 30 minutes

### 3.2 — API key request flow
- **What:** Simple form to request an API key (or auto-generate for authenticated users)
- **Files:** New `app/docs/request-key/page.tsx` or inline on docs page
- **Success:** Developers can get an API key without manual approval

**Phase 3 outcome:** MoltScore has public API documentation and a self-serve API key flow.

---

## Phase 4: Composability (make it portable) — Future

**Goal:** Scores become portable, verifiable, and usable across the ecosystem.

### 4.1 — Onchain score attestations
- Publish scores as EAS (Ethereum Attestation Service) attestations on Base
- Other protocols can verify scores onchain without trusting MoltScore's API

### 4.2 — Mintable tier badges
- Agents can mint their tier as an NFT
- Badge persists even if score later drops (proof of past achievement)

### 4.3 — Embeddable widget / SDK
- `<MoltScoreBadge agent="oracle_alpha" />` for other apps
- JavaScript SDK: `moltscore.getScore("oracle_alpha")`

### 4.4 — Webhook system
- Notify integrators when an agent's tier changes
- `POST` to registered callback URL with score update payload

### 4.5 — Score gating
- Provide a simple SDK for protocols to gate features by MoltScore tier
- Example: "Only agents with tier A or above can access this DeFi vault"

**Phase 4 is future work** — only relevant once Phases 0–3 are live and there's adoption.

---

## Implementation Order (Task-by-Task)

Each task is small, testable, and independent. One at a time.

### Phase 0 — Production ($0 deployment) ✅ COMPLETE
- [x] **0.1** Create `app/api/cron/score/route.ts` (cron-to-API conversion)
- [x] **0.2** Create `.github/workflows/score.yml` (15-min cron trigger)
- [x] **0.3** Document Neon + Vercel setup in README
- [x] **0.4** Vercel deployment config (maxDuration=60 for Hobby)
- [x] **0.5** Persist `lastProcessedBlock` + `walletMetrics` to database

### Phase 1 — Reputation API ✅ COMPLETE
- [x] **1.1** Unify basic + enhanced scoring
- [x] **1.2** Build `GET /api/agent/:username` endpoint
- [x] **1.3** Build `POST /api/agent/register` endpoint
- [x] **1.4** API key system (`lib/apiAuth.ts` + `api_keys` table)
- [x] **1.5** Dynamic landing page stats

### Phase 2 — Agent Passport
- [ ] **2.1** Agent Passport page (`app/agent/[username]/page.tsx`)
- [ ] **2.2** Score component visualization
- [ ] **2.3** Data points display
- [ ] **2.4** OG image for sharing
- [ ] **2.5** Link passport from leaderboard

### Phase 3 — API Documentation
- [ ] **3.1** API docs page (`app/docs/page.tsx`)
- [ ] **3.2** API key request flow

**Total: 17 tasks across 4 phases.**

---

## Project Status Board

### Completed
- [x] Landing page (reputation framing, responsive, animated)
- [x] Leaderboard app (standard + enhanced views)
- [x] Scoring engines (basic + enhanced)
- [x] Agent discovery pipeline
- [x] Onchain metrics collection
- [x] MoltCourt + Bankr integrations
- [x] Autonomous scoring loop
- [x] Database schema (core + enhanced)
- [x] Credit → Reputation copy pivot

### Next Up
- [x] **Phase 0:** Production infrastructure ($0 deployment) ✅
- [x] **Phase 1:** Reputation API ✅
- [ ] **Phase 2:** Agent Passport
- [ ] **Phase 3:** API Documentation

## Executor's Feedback or Assistance Requests

- **Phase 0 COMPLETE.** All 5 tasks executed and verified.
- **Phase 1 COMPLETE.** All 5 tasks executed and verified:
  - **1.1** `app/api/leaderboard/route.ts` — unified endpoint that prefers enhanced data, falls back to basic. Returns `source: "enhanced" | "basic"` field so consumers know which scoring system was used.
  - **1.2** `app/api/agent/[username]/route.ts` — full reputation profile for any agent. Returns score, tier, 5-component breakdown with signal strengths, all data points, and metadata. Falls back through enhanced → basic → discovered stages. Returns 404 if agent not found.
  - **1.3** `app/api/agent/register/route.ts` — self-registration endpoint. Agents POST `{ username, wallet? }` to register. Upserts into `discovered_agents`. Returns current score if already scored, or `"registered"` status if queued for next cycle.
  - **1.4** `lib/apiAuth.ts` — API key generation (SHA-256 hashed, `ms_` prefixed), validation with daily rate limiting. `app/api/keys/route.ts` — admin-only key generation (protected by `CRON_SECRET`). `api_keys` table added to `scripts/initDb.ts`.
  - **1.5** `app/page.tsx` — landing page now fetches live agent count and tier count from the database at render time. Stats display dynamically.
  - **Build:** Clean (`next build` passes, TypeScript passes, no new lint errors).
- Ready for Phase 2 (Agent Passport) execution upon user approval.

## Lessons

- `Pixelify_Sans` from `next/font/google` requires `weight: "variable"`, not `"400 700"`.
- Apply both `.variable` (on `<html>`) and `.className` (on `<body>`) for Next.js Google Fonts to work globally.
- Gradient text requires inline `style` with `WebkitBackgroundClip` and `WebkitTextFillColor` — Tailwind classes alone can fail.
- Hero background gradients must be applied directly to the section element (not absolute children with negative z-index) for reliable visibility.
- Use Tailwind theme-aware utilities (`text-foreground`) instead of arbitrary `[var(--foreground)]` classes when the variable is mapped in `@theme inline`.
- The backend scoring engines don't use "credit" terminology — the credit framing was only in frontend copy.
- Vercel Hobby plan doesn't support cron jobs at 15-min intervals — use GitHub Actions (free for public repos) as external trigger instead.
- Neon free tier (0.5 GB) is more than enough for thousands of agents.
- The existing `node-cron` loop logic doesn't need to change — just needs to be callable from an API route for serverless deployment.
