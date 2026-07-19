# OrderVora — Master Execution Sequence

> **Document type:** Phase 1, Deliverable 4.
> **Purpose:** The complete implementation order required to reach blueprint
> completion, starting from **current repository reality** — additive
> evolution only, minimizing migration risk. No feature is built here; this is
> the sequence.
> **Repository:** `abukeeth/core` @ `main` `f126fef`. **Date:** 2026-07-19.
> **Companions:** `ORDERVORA_SOURCE_OF_TRUTH.md`, `BLUEPRINT_GAP_MATRIX.md`,
> `PHASE_1_FOUNDATION_COMPLETION_PLAN.md`.

---

## Operating constraints (non-negotiable)

- **Start from reality.** The Express/Prisma/Postgres monolith with a deep
  commerce domain, website builder, Theme Engine V3, and menu-photo AI import
  is the launch pad — ~90% of product surface already exists.
- **Do not rebuild the platform.** Every step is additive.
- **Minimize migration risk.** Schema changes are additive and backward-
  compatible (new nullable columns / new tables), never renames of the 94
  `restaurantId` references or the `Restaurant` tenant table.
- **Preserve working functionality.** App-layer tenant scoping stays even
  after RLS lands (belt-and-suspenders).

---

## The three headline answers

- **Single highest-priority architecture milestone:**
  **Database-enforced tenant isolation (RLS or path-(b) equivalent).** It is
  the blueprint's foundational safety guarantee (§6, §19), it is entirely
  absent today, and it gates trustworthy scaling, the KDS "financial firewall,"
  and safe AI data access. Everything else is features on top of a safe
  substrate.

- **Single highest-risk area:**
  **Multi-tenant data isolation as currently implemented** — app-layer Prisma
  scoping with no automated guard and no RLS. One missing `where:
  { restaurantId }` is a cross-tenant data leak. Highest-risk because the
  impact (data breach across businesses) is catastrophic and the current
  control (developer discipline) is the weakest possible.

- **Single biggest production blocker:**
  **No billing / subscription system.** The entire revenue model
  (Starter/Growth/Pro/Enterprise) is unbuilt; pilots cannot be monetized and
  referral rewards are inert. It blocks the business, not just a feature.

---

## Execution sequence (dependency-ordered stages)

Each stage lists its purpose, what it depends on, and the primary gap-matrix
rows it closes. Stages are ordered so nothing is built before its foundation.

### STAGE 0 — Phase 1 Foundation (decisions & governance)
*Everything in `PHASE_1_FOUNDATION_COMPLETION_PLAN.md`.*
- **Delivers:** substrate ADR (F1.1), isolation guardrail + RLS plan (F1.2/3),
  tenant-model / bilingual / monetization decisions (F1.4/5/9), doc truth
  reset (F1.6), production-stability + integration-honesty (F1.7/8), security
  baseline (F1.10).
- **Depends on:** this analysis being accepted.
- **Closes (as decisions):** the ambiguity behind A1, A2, F1, G1, I2, J1.
- **Exit:** a decided substrate and a safe, honest program.

### STAGE 1 — Tenant Isolation Hardening (the keystone architecture milestone)
- **Purpose:** Implement DB-enforced isolation per the Stage-0 plan: interim
  query-scoping CI guard → per-table RLS (start `Order`, `Payment`,
  `Customer`, `Restaurant`, catalog) → cross-tenant penetration test as a CI
  gate. Keep app-layer scoping intact.
- **Depends on:** Stage 0 (F1.1/2/3).
- **Closes:** **A1** 🔴, foundation for **C2** (financial firewall), **G1**
  (safe AI data access).
- **Migration risk:** Low if additive (policies + session-var context); app
  keeps working because scoping is unchanged. Roll out table-by-table.

### STAGE 2 — Monetization Foundation (the first product milestone)
- **Purpose:** Build billing: plan/subscription/entitlement models, Stripe
  Billing (and resolve Stripe **Connect** vs BYOP for platform margin), trials,
  annual discount, plan-gating middleware, activate referral rewards.
- **Depends on:** Stage 0 (F1.9 decision), Stage 1 (subscriptions hang off the
  isolated tenant). Can begin in parallel with late Stage 1 since it is mostly
  new tables.
- **Closes:** **J1** 🔴, **H1** 🟠 (Connect), unblocks referral rewards, feeds
  **G1** (per-plan AI/SMS quotas), **J2** (admin billing ops).
- **Migration risk:** Low — new tables, additive.

### STAGE 3 — Realtime + Cron Substrate
- **Purpose:** Replace polling with a push layer (SSE/WS under path b, or
  Supabase Realtime under path a) for order tracking, KDS, onboarding
  progress; add a durable scheduler for automations + proactive AI.
- **Depends on:** Stage 0 (F1.1 mechanism).
- **Closes:** **F1** 🟠, **F2** 🟡, upgrades **C2** (live tracking), **B5**
  (magic progress). Prerequisite for Stage 5 delivery tracking and Stage 6 AI.
- **Migration risk:** Low — additive transport; existing polling can coexist
  during cutover.

### STAGE 4 — Marketing + Customer CRM + Compliance
- **Purpose:** Build the Customer CRM + segments, the marketing-automation
  engine (campaigns/automations: winback/birthday/review/welcome/referral),
  **TCPA opt-in/consent ledger first**, then wire real SMS (Twilio) and
  marketing email.
- **Depends on:** Stage 3 (cron/realtime), Stage 2 (plan quotas). **E3 (TCPA)
  must land before any SMS marketing.**
- **Closes:** **E1** 🟠, **E2** 🟠, **E3** 🔴(if-SMS), **H4** 🟠, **H5** 🟡,
  **C3** triggers.
- **Migration risk:** Low–medium — new tables + external providers.

### STAGE 5 — Delivery-as-a-Service
- **Purpose:** Implement Uber Direct + DoorDash Drive (quote → dispatch on
  "ready" → webhook status → live driver tracking via Stage 3 realtime), with
  auto-fallback. Un-stub the fulfillment providers.
- **Depends on:** Stage 3 (realtime tracking), Stage 1 (isolation for driver
  data). The delivery-rules/quote framework already exists.
- **Closes:** **H2** 🟠, completes **C2** delivery leg.
- **Migration risk:** Low — provider adapters already scaffolded as stubs.

### STAGE 6 — AI Business Consultant (Layer 3) + AI isolation
- **Purpose:** Build reactive chat over tenant data via safe, tenant-scoped
  tools; proactive scheduled `ai_insights` with **one-click execute** into
  marketing/menu actions; per-tenant AI cost tracking + quotas; move AI calls
  behind the chosen isolation boundary; default provider per Stage-0 ADR.
- **Depends on:** Stage 1 (safe data access), Stage 3 (cron), Stage 4 (actions
  to execute), Stage 2 (quotas).
- **Closes:** **G2** 🟠, **G1** 🟡.
- **Migration risk:** Low — new tables (`ai_conversations`, `ai_insights`).

### STAGE 7 — Bilingual (EN/AR) + RTL
- **Purpose:** Add `*_ar` (or translations) to catalog per Stage-0 decision;
  web i18n + real RTL across screens; AR content generation in the builder.
- **Depends on:** Stage 0 (F1.5). Schema part is cheap now; do before tenant
  data grows large.
- **Closes:** **I2** 🟠(GTM).
- **Migration risk:** Low if done early (additive columns); rises with data
  volume — an argument to sequence the *schema* part earlier.

### STAGE 8 — Horizontal Expansion (P3)
- **Purpose:** Clover import + continuous sync; vape/retail specifics (age
  verification, shipping restrictions); multi-location (`locations`);
  pgvector/semantic search; POS integrations begun.
- **Depends on:** Stage 1 (isolation), Stage 0 (F1.4 tenant reshape).
- **Closes:** **B3**, **H3**, **I1**, **I3**, **D3** (AI images).
- **Migration risk:** Medium — multi-location touches inventory/hours; do
  additively behind the F1.4 plan.

### STAGE 9 — Enterprise (P4)
- **Purpose:** Franchise management, light POS, public API, owner/customer
  mobile apps, accounting integrations, super-admin depth (health, AI-cost,
  support), MFA rollout completion.
- **Depends on:** All prior stages; especially Stage 0 tenant reshape + Stage 1
  isolation + Stage 2 billing.
- **Closes:** remaining **J2**, **J3**, blueprint §20 P4 scope.

---

## Completion percentages (evidence-based estimates)

These are **weighted engineering estimates** derived from the classifications
in `ORDERVORA_SOURCE_OF_TRUTH.md` (verified code inspection), not precise
metrics. They weight foundational/safety capabilities heavily.

### 1. Current completion percentage (of a launchable, blueprint-honest MVP+)
**≈ 60%.**
- Strong, real: commerce core, website builder, Theme Engine V3, menu-photo AI
  import, auth, admin basics, reliability primitives, Stripe payments (BYOP),
  transactional email, deep test coverage.
- Missing for even a *monetized, safe* MVP+: billing (0%), DB isolation/RLS
  (0%), production auth fix pending (PR #6), realtime (polling only).

### 2. Blueprint completion percentage (of the full Master Blueprint vision)
**≈ 35–40%.**
- Delivered vs. the *entire* blueprint (P1–P4): commerce, site builder, theme,
  Layer-1 AI import ≈ done. But delivery (stub), SMS (stub), POS (stub),
  marketing automation (0%), AI Consultant (0%), billing (0%), bilingual/RTL
  (0%), multi-location (0%), pgvector (0%), RLS (0%), Stripe Connect (0%), and
  the Supabase/Edge/Realtime substrate (0%) are large, unbuilt swaths.

*(Note: the blueprint's own narrative claims "~90% ready." That figure
reflects the **product surface** of the P1 restaurant-MVP, not the full
multi-phase BOS. Measured against the whole blueprint, ~35–40% is the
evidence-based number.)*

---

## Top 10 blockers (ranked)

1. **No DB-enforced tenant isolation (RLS).** 🔴 Data-safety; blocks safe
   scale. *(A1)*
2. **No billing/subscription system.** 🔴 Cannot monetize; business blocker.
   *(J1)*
3. **Undecided platform substrate** (Supabase-migrate vs Postgres-native).
   Every architecture task is ambiguous until resolved. *(Stage 0 / F1.1)*
4. **Delivery providers are stubs** (Uber Direct / DoorDash Drive). 🟠 P2
   headline unfulfillable. *(H2)*
5. **SMS is a stub + no TCPA consent layer.** 🟠/🔴 Blocks order SMS and all
   SMS marketing (legal). *(H4, E3)*
6. **No marketing automation / Customer CRM.** 🟠 "Own your customers" value
   unbuilt. *(E1, E2)*
7. **No AI Business Consultant** (Layer 3). 🟠 Headline differentiator absent.
   *(G2)*
8. **No realtime substrate** (polling only). 🟠 Live tracking/KDS/magic-
   progress and the RLS financial firewall UX. *(F1, C2)*
9. **No bilingual/RTL.** 🟠 for the Arabic/Yemeni GTM — the stated unfair
   advantage. Cheapest to seed early. *(I2)*
10. **Live production auth bug (PR #6) + integration overstatement risk.** 🟠
    Register/login "Request failed"; stubs presented as integrations. *(F1.7)*

---

## 4. Recommended first implementation milestone after Phase 1

**Milestone: "Isolation + Monetization Base."** Run **Stage 1 (Tenant
Isolation Hardening)** and **Stage 2 (Monetization Foundation)** as the first
milestone.

- **Why these two first:** Stage 1 removes the #1 *risk* (cross-tenant leak)
  and is the keystone architecture milestone; Stage 2 removes the #1
  *production blocker* (no revenue). They are largely independent (isolation =
  policies on existing tables; billing = new tables), so they parallelize with
  low migration risk, and together they turn the platform from "impressive but
  unsafe and unmonetizable" into "safe and sellable" — without building a
  single speculative feature.

---

## 5. Recommended PR sequence

Small, additive, independently reviewable PRs. (Governance PRs first so the
program is honest before code moves.)

**Governance / stability (immediate):**
1. **Land PR #6** (auth-proxy trailing-slash fix) — verified live bug, minimal.
2. **Resolve stale PRs:** close/rebase **#14** (superseded by Theme Engine V3),
   reconcile **#8** (discovery audit) into these four docs, triage drafts
   **#6/#2**.
3. **Doc truth reset** — correct `PROJECT_MEMORY.md` identity/scope; add
   source-of-truth hierarchy (F1.6).
4. **Integration Readiness Ledger** + storefront feature-gate for stub
   providers (F1.7/F1.8).

**Stage 1 — Isolation (sequential, table-grouped):**
5. Tenant-context convention + **CI query-scoping guard** (no schema change).
6. **Cross-tenant penetration test harness** in CI (two-tenant seed).
7. RLS on **highest-sensitivity tables** (`Order`, `Payment`, `Customer`),
   behind additive migrations, app-scoping retained.
8. RLS on **`Restaurant` + catalog + remaining tenant-owned tables** (batched).

**Stage 2 — Monetization (parallelizable with 5–8):**
9. **Plan/Subscription/Entitlement schema** (additive tables) + seed plans.
10. **Stripe Billing integration** + trial/annual logic; resolve **Connect**
    vs BYOP (may be its own PR).
11. **Plan-gating middleware** + activate referral rewards + admin billing
    view.

**Then proceed to Stage 3 (realtime/cron) → Stage 4 (marketing/CRM/TCPA) →
Stage 5 (delivery) → Stage 6 (AI Consultant) → Stage 7 (bilingual) → Stage 8
(horizontal) → Stage 9 (enterprise)**, each as its own additive PR series
gated by the isolation and billing foundations above.

---

*End of Master Execution Sequence. This document, with its three companions,
constitutes the OrderVora Phase-1 governance and execution foundation:
evidence-based, additive, and faithful to "own the platform, don't rebuild
it."*
