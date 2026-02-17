# MoltScore Project Scratchpad

## Background and Motivation

**UPDATED:** MoltScore is pivoting from a "credit scoring system" to a **reputation layer for autonomous AI agents**. The new framing:

> MoltScore is the **reputation layer** for autonomous agents — unlocking rich, verifiable reputation data that makes true agents visible.

The shift is conceptual, not structural. The scoring engine, data pipeline, tier system, and multi-dimensional analysis all stay. What changes is the **language and framing** — from financial credit metaphors (credit tiers, credit scores, credibility) to **reputation and trust metaphors** (reputation data, trust signals, verified agents, proven track records).

**Why this matters:** "Credit layer" implies financial lending risk. "Reputation layer" implies trust, visibility, and discoverability — which is actually what the product does. Agents aren't being lent money; they're being evaluated on their track record to help ecosystems and protocols decide who to trust.

---

## Key Challenges and Analysis

### The Pivot: Credit → Reputation

The backend logic is **already reputation-focused** — it evaluates task performance, dispute history, ecosystem participation, intellectual contribution, and financial behavior. The "credit" framing was only a copywriting choice. The scoring engines don't use "credit" terminology internally.

**What changes:**
- Frontend copy (landing page, app page, metadata)
- A few backend comments/headers
- Conceptual framing in documentation

**What does NOT change:**
- Scoring formulas
- Database schema
- API endpoints or response formats
- Tier system structure (AAA–Risk Watch is fine for reputation too)
- Data pipeline

### Specific Copy Changes Needed

| Location | Current (Credit) | New (Reputation) |
|---|---|---|
| Hero H1 | "The credit layer for autonomous agents" | "The reputation layer for autonomous agents" |
| Hero subtitle | "MoltScore ranks onchain AI agents... One score, clear tiers, full transparency." | "Unlocking rich and verifiable reputation data that makes true agents visible." |
| Stats | "CREDIT TIERS" | "REPUTATION TIERS" |
| Feature: title | "CREDIT TIERS" | "REPUTATION TIERS" |
| Feature: description | "From AAA to Risk Watch. Clear tiers so users and integrators know who to trust at a glance." | "From AAA to Risk Watch. Clear tiers so protocols and builders know who to trust at a glance." |
| Feature: "ONCHAIN SCORING" desc | "...single credibility score..." | "...single reputation score..." |
| Features section subtitle | "Onchain credibility, one score, clear tiers." | "Verifiable reputation, one score, clear tiers." |
| Footer flow step | "Track credibility" | "Track reputation" |
| Footer CTA | "Need agent credibility scores?" | "Need agent reputation data?" |
| Layout metadata | "The Credit Layer for Autonomous Agents" | "The Reputation Layer for Autonomous Agents" |
| `lib/score.ts` comment | "Credit Layer for Autonomous Agents" | "Reputation Layer for Autonomous Agents" |

### Additional Improvements (Reputation-aligned)

With the new framing, some additional copy improvements make sense:

1. **Hero messaging** — Emphasize "visibility" and "verifiable" data, not just ranking
2. **Feature cards** — Could reframe slightly to emphasize "reputation signals" rather than just "scoring"
3. **"Built for" subtitle** — Should emphasize trust/discovery, not just credibility

---

## High-level Task Breakdown

### Task 1: Frontend Copy — Landing Page (`app/page.tsx`)
- [ ] Update hero H1, subtitle, and CTA labels
- [ ] Update stats section ("CREDIT TIERS" → "REPUTATION TIERS")
- [ ] Update features data array (titles, descriptions, pills)
- [ ] Update features section subtitle
- [ ] Update footer copy (flow steps + CTA)
- **Success criteria:** No instance of "credit" or "credibility" in landing page. All copy reflects reputation/trust framing.

### Task 2: Metadata + Backend Comments
- [ ] Update `app/layout.tsx` metadata description
- [ ] Update `lib/score.ts` file header comment
- **Success criteria:** `grep -i "credit" app/layout.tsx lib/score.ts` returns nothing.

### Task 3: App Page Review (`app/app/page.tsx`)
- [ ] Review for any credit-specific language
- [ ] Already uses "Score", "Tier", "Leaderboard" — likely minimal changes needed
- **Success criteria:** No credit-specific language in the app page.

### Task 4: Scratchpad + Documentation
- [ ] Update scratchpad to reflect new positioning
- **Success criteria:** Documentation reflects reputation layer framing.

---

## Strategic Vision: MoltScore as "Talent Protocol for Agents"

### The Talent Protocol Model (for humans)

Talent Protocol built a **composable reputation infrastructure** for human builders:

1. **Talent Passport** — a portable onchain profile auto-populated with verified data
2. **Data Points** — atomic, verified facts (GitHub commits, ETH txns, hackathon wins) from 40+ integrations
3. **Builder Score** — a composite score computed from Data Points, with transparent signal strength weights
4. **Credentials** — onchain attestations that break down what contributed to the score
5. **Open API** — any app can query scores, credentials, and data points via API key
6. **Mintable Badges** — level-based NFT badges that persist even if score drops
7. **Integrations** — Basenames, Etherscan, Farcaster, etc. use Builder Score as a trust signal

**Key insight:** Talent Protocol is not just a leaderboard — it's **infrastructure**. Other apps consume the data. The score is portable. The data is composable.

### What MoltScore Currently Is vs. What It Could Be

| Dimension | MoltScore Today | Talent Protocol Equivalent | Gap |
|---|---|---|---|
| **Profile** | No agent profile page | Talent Passport | Need "Agent Passport" |
| **Data Points** | 5 data sources (onchain, MoltCourt, Bankr, Moltbook, activity) | 40+ integrations | Need more data sources + atomic data point model |
| **Score** | Composite score (300–950) | Builder Score (0–250+) | Have this, but need transparent breakdowns |
| **Credentials** | None | Onchain attestations | Need verifiable credential system |
| **API** | Read-only leaderboard | Full CRUD + lookup + search | Need self-serve API |
| **Self-registration** | None — passive discovery only | Wallet connect → auto-populate | Need agent registration endpoint |
| **Portability** | Scores live in MoltScore DB only | Onchain attestations, portable | Need onchain score publishing |
| **Badges** | None | Mintable level badges | Nice to have |
| **Integration** | None — only MoltScore UI | Apps integrate via API | Need API keys + docs |

### Recommended Evolution Path

#### Phase 1: Agent Passport + Self-Serve API (make it useful)
- **Agent Passport page** — `/agent/:username` showing full reputation breakdown
- **Self-registration API** — `POST /api/agent/register` so agents can submit themselves
- **Agent lookup API** — `GET /api/agent/:username` returning score + all data points
- **API key system** — so other protocols can query reputation data
- **Transparent score breakdown** — show exactly what contributed to the score (like Talent Protocol's Credentials view)

#### Phase 2: Data Point Architecture (make it composable)
- **Atomic Data Points model** — break the score into individual verifiable facts:
  - `tasks_completed: 1240` (source: Base chain, contract: 0x...)
  - `debate_win_rate: 0.72` (source: MoltCourt)
  - `portfolio_value: $12.4K` (source: Bankr)
  - `account_age: 89 days` (source: Base chain)
- **Data Point categories:** Performance, Financial, Social, Governance
- **Signal strength labels:** Each data point rated weak/medium/strong
- **New data sources:** Expand beyond current 5 — consider:
  - Cross-chain activity (Ethereum, Arbitrum, etc.)
  - Protocol-specific reputation (Aave, Uniswap governance)
  - Social signals (Farcaster, Twitter engagement quality)
  - Code quality (if agent has open-source repos)

#### Phase 3: Onchain + Composability (make it portable)
- **Onchain score attestations** — publish scores as EAS attestations or similar
- **Mintable tier badges** — agents can mint their tier as an NFT (persists even if score drops)
- **Score gating** — other protocols can gate access based on MoltScore tier
- **Webhook system** — notify integrators when an agent's tier changes
- **SDK/Widget** — embeddable MoltScore badge for agent profiles elsewhere

#### Phase 4: Network Effects (make it defensible)
- **Protocol integrations** — pitch DeFi protocols to use MoltScore for agent access control
- **Score-gated features** — agents with higher scores get priority in Molt ecosystem
- **Reputation staking** — agents can stake tokens on their reputation score
- **Decay + recovery** — scores gradually decay without activity, encouraging ongoing good behavior

### What Makes This Different from Talent Protocol

Talent Protocol is for **humans**. MoltScore is for **agents**. The key differences:

1. **Agents are autonomous** — they don't "sign up" the way humans do. The system needs to discover AND allow self-registration.
2. **Agent reputation changes faster** — an agent can complete 100 tasks in a day. Scoring frequency matters more.
3. **Agent trust is binary in practice** — protocols either trust an agent enough to interact with it or they don't. Tier gating is more important than nuanced scores.
4. **Agents can be verified differently** — code audits, smart contract verification, onchain behavior patterns are all available for agents but not humans.
5. **Multi-chain is essential** — agents operate across chains more fluidly than humans. Cross-chain reputation aggregation is a stronger selling point.

---

### Previous Technical Tasks (still valid)

#### Priority 1: Critical for product integrity
- [ ] **1.1** — Make landing page stats dynamic from `/api/status`
- [ ] **1.2** — Unify basic vs. enhanced scoring systems
- [ ] **1.3** — Add agent lookup API: `GET /api/agent/:username`

#### Priority 2: Important for stated value proposition
- [ ] **2.1** — Add API rate limiting
- [ ] **2.2** — Create Agent Passport page (score breakdown)
- [ ] **2.3** — Add API documentation
- [ ] **2.4** — Agent self-registration endpoint

#### Priority 3: Technical debt / reliability
- [ ] **3.1** — Persist `lastProcessedBlock` to database
- [ ] **3.2** — Database migration system
- [ ] **3.3** — Error handling + retry logic
- [ ] **3.4** — API key auth for external consumers

---

## Project Status Board

- [x] Reduce hero button sizes (Executor)
- [x] Explore backend structure (Planner)
- [x] Document backend alignment analysis (Planner)
- [x] Plan credit → reputation pivot (Planner)
- [x] **Task 1:** Update landing page copy — full reputation framing + enhanced interactivity (Executor)
- [x] **Task 2:** Update metadata (`layout.tsx`) + backend comment (`lib/score.ts`) (Executor)
- [x] **Task 3:** Verify app page has no credit language — confirmed clean (Executor)
- [x] **Task 4:** Update scratchpad documentation (Executor)
- [x] Final sweep: 0 instances of "credit"/"credibility" in any `.tsx`, `.ts`, `.css`, `.json` file (Executor)
- [ ] Awaiting user direction on backend improvement priorities

## Executor's Feedback or Assistance Requests

- **Reputation pivot is complete.** All frontend copy, metadata, and backend comments updated.
- **Enhanced interactivity added:** shimmer effect on stat values, float animation on hero badge, scale-in on stats, gradient glow on feature card hover, stagger-children utility, improved hover states across all interactive elements, trust signal checkmarks in hero, new "How reputation works" footer flow, purple gradient on "agent trust" heading.
- **Zero lint errors** across all edited files.
- Awaiting user visual verification and direction on backend improvement priorities.

## Lessons

- `Pixelify_Sans` from `next/font/google` requires `weight: "variable"`, not `"400 700"`.
- Apply both `.variable` (on `<html>`) and `.className` (on `<body>`) for Next.js Google Fonts to work globally.
- Gradient text requires inline `style` with `WebkitBackgroundClip` and `WebkitTextFillColor` — Tailwind classes alone can fail.
- Hero background gradients must be applied directly to the section element (not absolute children with negative z-index) for reliable visibility.
- Use Tailwind theme-aware utilities (`text-foreground`) instead of arbitrary `[var(--foreground)]` classes when the variable is mapped in `@theme inline`.
- The backend scoring engines (scoringEngine.ts, enhancedScoringEngine.ts) don't use "credit" terminology — the credit framing was only in frontend copy and a couple of comments. This makes the pivot purely a copy/framing change.
