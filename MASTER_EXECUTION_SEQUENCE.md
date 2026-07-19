# OrderVora — Master Execution Sequence

> **Document type:** Phase 1, Deliverable 4 — **now the single canonical
> roadmap for OrderVora.** All other planning documents feed into this one; when
> they disagree on ordering, this document wins.
> **Purpose:** The complete implementation order required to evolve OrderVora
> from its current restaurant-centric reality to (a) blueprint completion and
> (b) the **Business Operating System (BOS)** target architecture — additive
> evolution only, minimizing migration risk. No feature is built here; this is
> the sequence.
> **Repository:** `abukeeth/core` @ `main` `f126fef`. **Date:** 2026-07-19
> (updated to fold in the approved BOS P0–P10 roadmap).
> **Canonical inputs (cross-referenced throughout):**
> - `ORDERVORA_SOURCE_OF_TRUTH.md` — verified current-state engineering facts.
> - `BLUEPRINT_GAP_MATRIX.md` — per-capability gaps, risks, dependency chains.
> - `PHASE_1_FOUNDATION_COMPLETION_PLAN.md` — the Phase-1 foundation decisions.
> - `BUSINESS_OS_FOUNDATION.md` — the approved BOS target architecture.
> - `BUSINESS_OS_IMPLEMENTATION_PLAN.md` — the approved BOS phase plan (P0–P10),
>   whose full detail this document folds in and treats as authoritative.

---

## How this roadmap is structured (read this first)

This document now carries **two complementary, reconciled views** of the same
additive evolution — do not treat them as competing plans:

1. **The BOS Evolution Roadmap (P0–P10)** — *the authoritative implementation
   path.* It is the **structural spine**: how the platform evolves from a
   `Restaurant`/`restaurantId` tenant model to the Organization → Business →
   Location architecture, with Membership and Capabilities. Sourced verbatim in
   intent from `BUSINESS_OS_IMPLEMENTATION_PLAN.md`. **When sequencing a piece
   of work, start here.**

2. **The Blueprint Feature Stages (Stage 0–9)** — *preserved historical view,
   unchanged below.* It is the **feature-delivery** view: how blueprint
   capabilities (isolation, billing, realtime, marketing, delivery, AI
   consultant, bilingual, etc.) get delivered. Every feature stage now **maps
   onto** a BOS phase (see the reconciliation table) rather than standing alone.

The two are the same journey seen structurally vs. by feature. The
**reconciliation map** (immediately after the BOS roadmap) is the join between
them. Nothing from the original Stage 0–9 sequence has been removed.

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

# PART A — BOS Evolution Roadmap (P0–P10) — AUTHORITATIVE

*The approved structural implementation path from restaurant-centric to Business
Operating System. Full per-phase detail (objective, why, repository areas, data
model / API / UI impact, risks, acceptance criteria) lives in
`BUSINESS_OS_IMPLEMENTATION_PLAN.md`; the architecture rationale lives in
`BUSINESS_OS_FOUNDATION.md`. This is the canonical order — everything in Part B
maps onto it.*

**The load-bearing reinterpretation (from `BUSINESS_OS_FOUNDATION.md`):** the
existing **`Restaurant` == a Business**, and **`restaurantId` == the Business
scope key**. This holds from P0 onward *by convention*, before any physical
rename (deferred to P10). All ~94 `restaurantId` references keep working.

```
P0  Terminology & Tenant Context        (no schema change; legacy = superset)
P1  Organization layer                  (auto-wrap each existing Business)
P2  Membership & scoped roles           (dual-read; ownership truth → Membership)
P3  Capability / Module system          (seed from BusinessType; everyone = today)
P4  Location layer                      (mirror single address; invisible)
P5  DB-enforced isolation (RLS)         (keyed on Business == restaurantId)
P6  Billing @ Organization              (entitlements → capabilities/quotas)
P7  Multi-location activation           (place data separates from Business)
P8  Multi-business ownership & Types    (one Org, many Businesses; new verticals)
P9  New vertical modules                (Age Verification, Inventory-first, …)
P10 Physical restaurantId → businessId  (optional, late, behind aliases)
```

| Phase | Delivers | Schema change? | Depends on | Reversible |
|---|---|---|---|---|
| **P0** | Terminology + Tenant Context seam | No | — | Yes |
| **P1** | Organization layer | Additive | P0 | Yes |
| **P2** | Membership & scoped roles (dual-read) | Additive | P1 | Yes |
| **P3** | Capability/Module system | Additive | P2 | Yes |
| **P4** | Location layer (mirror) | Additive | P1 | Yes |
| **P5** | DB-enforced isolation (RLS) | Additive (policy) | P0, P4 | Yes (per-table) |
| **P6** | Billing @ Organization | Additive | P1, P3 | Yes |
| **P7** | Multi-location activation | Additive + read-move | P4, P5, P6 | Yes |
| **P8** | Multi-business ownership & Type profiles | Additive | P2, P3, P6 | Yes |
| **P9** | New vertical modules | Additive | P3, P5, P6, P8 | Yes |
| **P10** | Physical rename (optional) | Additive→cutover | P0–P9 | Yes |

**Where the audit's critical items land on the BOS spine:**
- **RLS** (`BLUEPRINT_GAP_MATRIX.md` A1, the highest-priority architecture
  milestone) → **P5**, after the Business scope key is stable and Tenant Context
  (P0) exists.
- **Billing** (gap J1, the biggest production blocker) → **P6**, right after its
  home (Organization, P1) and its lever (Capabilities, P3) exist.
- **Multi-location / multi-vertical** (gaps A2, I1; the BOS promise) → **P4/P7**
  and **P8/P9**.

---

# PART B — Blueprint Feature Stages (Stage 0–9) — PRESERVED

*The original feature-delivery sequence, unchanged. Each stage now maps onto a
BOS phase from Part A via the reconciliation table below; nothing here has been
removed or reordered.*

## Reconciliation map — Feature Stages ↔ BOS Phases

| Feature Stage (Part B) | Primary BOS Phase(s) (Part A) | Notes |
|---|---|---|
| **Stage 0** — Phase-1 Foundation (decisions/governance) | **P0** (+ sets up P1–P6 decisions) | Substrate/tenant/billing/bilingual decisions gate the BOS spine. |
| **Stage 1** — Tenant Isolation Hardening (RLS) | **P5** | Same work; BOS names its prerequisites (P0 context, P4 location scope). |
| **Stage 2** — Monetization Foundation | **P6** | BOS places billing at the Organization created in P1, gated by P3 capabilities. |
| **Stage 3** — Realtime + Cron Substrate | cross-cuts **P4–P9** | Infrastructure the BOS phases consume (live location tracking, cron automations). |
| **Stage 4** — Marketing + CRM + Compliance | rides on **P3/P6/P8** | Marketing becomes a **Capability** (P3), plan-gated (P6), Business-scoped (P8). |
| **Stage 5** — Delivery-as-a-Service | **Delivery Capability** in **P3/P9**, per-location in **P7** | Delivery becomes a module enabled per Business/Location. |
| **Stage 6** — AI Business Consultant + AI isolation | **P3 (AI Capability)** + **P5 (isolation)** | AI runs inside Tenant Context; isolation from P5, quotas from P6. |
| **Stage 7** — Bilingual (EN/AR) + RTL | additive, sequence early per **Stage 0** decision | Orthogonal to the spine; schema seeding cheapest before data grows. |
| **Stage 8** — Horizontal Expansion (Clover, vape/retail, multi-location, pgvector) | **P7 + P8 + P9** | This *is* the BOS multi-location / multi-vertical / new-module work. |
| **Stage 9** — Enterprise (franchise, POS, API, MFA) | **P8 + P9** (franchise needs Org/Business/Location + Membership) | Enterprise is the mature end-state of the BOS spine. |

**How to use both parts:** sequence *structural* work by **Part A (P0–P10)**;
track *feature/blueprint* delivery by **Part B (Stage 0–9)**; use the table to
translate between them. Part A is authoritative when the two imply different
orderings (they are designed not to, but Part A wins by rule).

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

- **On the BOS spine (Part A), this milestone is not P5+P6 in isolation.** The
  BOS ordering shows the true prerequisites: **P0 (Tenant Context)** and **P4
  (Location layer)** must precede the RLS work (P5), and **P1 (Organization) +
  P3 (Capabilities)** must precede billing (P6). In practice the first milestone
  therefore sequences as **P0 → P1 → (P3, P4 in parallel) → P5 → P6** — the
  smallest additive spine that makes isolation and monetization *correctly*
  placed rather than bolted onto the `Restaurant` table. P2 (Membership) lands
  alongside P1/P3 since billing and scoped access both depend on it. See
  `BUSINESS_OS_IMPLEMENTATION_PLAN.md` for each phase's acceptance criteria.

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

**Mapped onto the BOS spine (Part A):** the PR sequence above realizes the BOS
phases in order — governance/stability PRs (1–4) belong to **P0**; isolation PRs
(5–8) realize **P5** (with P0 context + P4 location scope as prerequisites);
monetization PRs (9–11) realize **P6** (on the P1 Organization, gated by P3
Capabilities); and the later feature stages realize **P3/P4/P7/P8/P9** per the
reconciliation map. Sequence structural PRs by Part A; describe their
feature payload by Part B.

---

## Canonical status & document hierarchy

This document is the **single canonical roadmap for OrderVora**. Its inputs, and
their roles:

| Document | Role relative to this roadmap |
|---|---|
| `ORDERVORA_SOURCE_OF_TRUTH.md` | Verified current-state facts this roadmap starts from. |
| `BLUEPRINT_GAP_MATRIX.md` | The gaps/risks each stage and phase closes (A1, J1, …). |
| `PHASE_1_FOUNDATION_COMPLETION_PLAN.md` | The Phase-1 decisions that gate the spine (Stage 0 / P0). |
| `BUSINESS_OS_FOUNDATION.md` | The approved BOS target architecture (the "why" behind Part A). |
| `BUSINESS_OS_IMPLEMENTATION_PLAN.md` | The approved BOS phase detail (the authoritative "how/when" of Part A). |

**Rule of precedence:** for *structural sequencing*, Part A (BOS P0–P10) is
authoritative and defers to `BUSINESS_OS_IMPLEMENTATION_PLAN.md` for per-phase
acceptance criteria. For *feature/blueprint tracking*, Part B (Stage 0–9)
remains the reference. The reconciliation map is the join between them. If any
other document implies a different order, **this roadmap wins** — update the
other document, not this ordering.

---

*End of Master Execution Sequence — the single canonical OrderVora roadmap. It
now carries both the preserved blueprint feature stages (Part B, Stage 0–9) and
the authoritative Business OS evolution roadmap (Part A, P0–P10), reconciled.
Evidence-based, additive, reversible, and faithful to "own the platform, don't
rebuild it."*
