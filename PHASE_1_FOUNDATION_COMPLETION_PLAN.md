# OrderVora — Phase 1 Foundation Completion Plan

> **Document type:** Phase 1, Deliverable 3.
> **Purpose:** Establish the **governance and execution foundation** for the
> whole program. Organized by **dependency order only** — *not* by dates.
> **Scope:** Phase 1 is a **foundation/decision phase**. It does **not** build
> product features; it removes the ambiguities and safety gaps that would make
> every later phase unsafe or contradictory. This document is a plan, not an
> implementation. **No code, migrations, or PRs are produced by it.**
> **Repository:** `abukeeth/core`. **Date:** 2026-07-19.
> **Companions:** `ORDERVORA_SOURCE_OF_TRUTH.md`, `BLUEPRINT_GAP_MATRIX.md`,
> `MASTER_EXECUTION_SEQUENCE.md`.

---

## Guiding principles (from the Master Blueprint + CLAUDE.md)

1. **Do not rebuild the platform.** Additive evolution only. The repo's
   Express/Prisma/Postgres monolith is a real, tested asset (~90% of product
   surface). Foundation work *hardens and clarifies* it, never replaces it.
2. **Production stability first**, then existing-feature completion, then UX,
   then new features (CLAUDE.md priority order).
3. **Preserve working functionality.** No feature is removed to satisfy a
   test or a doc.
4. **Every claim traces to evidence.** The foundation's job is to make the
   *program* as evidence-driven as this analysis was.

The single most important thing Phase 1 must settle: **the platform-substrate
decision** (Task F1.1). Every downstream phase depends on it.

---

## Dependency order at a glance

```
F1.1 Substrate Decision (Supabase-migrate vs Postgres-native RLS)
        │
        ├── F1.2 Tenant-isolation guardrails (tenant-context + query audit)
        │           │
        │           └── F1.3 RLS rollout plan + cross-tenant test harness
        │
        ├── F1.4 Tenant-model reshape decision (Restaurant→tenant, locations)
        │
        └── F1.5 Bilingual/RTL foundation decision (schema + i18n readiness)

F1.6 Documentation Truth Reset (memory files, PR hygiene)   ← parallel, no deps
F1.7 Production Stability Baseline (PR #6 fix, integration honesty)  ← parallel
F1.8 Integration Readiness Ledger (stub → real contract map)  ← after F1.6
F1.9 Monetization Foundation Decision (billing data contract)  ← after F1.4
F1.10 Security Baseline (MFA + secret/webhook posture)  ← after F1.1
```

---

## TASK F1.1 — Platform Substrate Decision (the keystone)

- **Objective:** Produce a signed-off architectural decision record (ADR) that
  chooses ONE of: **(a)** migrate to Supabase (Postgres+RLS+Edge+Realtime+
  pgvector) to match the blueprint literally, or **(b)** stay on
  Prisma/Express/Postgres and achieve the blueprint's *guarantees* natively
  (Postgres RLS via session variables, an SSE/WS realtime layer, an external
  cron, pgvector on the same Postgres). Document the chosen path, the explicit
  divergences from the blueprint's *implementation* while honoring its
  *intent*, and the migration/risk envelope.
- **Why it exists:** The blueprint prescribes Supabase; the repo is not on it.
  Until this is decided, every RLS, AI-isolation, realtime, and cron task is
  ambiguous, and teams will re-litigate the platform each sprint. This is the
  #1 source of architectural debt (Source-of-Truth §18–19).
- **Repository areas involved:** `apps/api` (Prisma datasource, `app.ts`,
  schedulers), `apps/api/prisma/schema.prisma`, deployment manifests
  (`render.yaml`, `railway.json`, `apps/web/vercel.json`), `docs/runbooks/*`,
  `docs/audits/PHASE_02_ARCHITECTURE_AUDIT.md`, `PROJECT_MEMORY.md`.
- **Dependencies:** None — this is the root.
- **Acceptance criteria:**
  - An ADR file exists stating the chosen substrate, rationale, and a
    point-by-point map of blueprint requirement → how it is met (or
    consciously deferred/diverged).
  - The ADR explicitly answers: RLS mechanism, realtime mechanism, cron
    mechanism, AI-isolation boundary, pgvector location, storage vendor.
  - The ADR is reconciled with `PROJECT_MEMORY.md` (which currently asserts
    "do not assume Supabase").
- **Validation method:** Review against `BLUEPRINT_GAP_MATRIX.md` rows A1, F1,
  F2, G1, H6, I3 — each must map to an ADR decision. Peer sign-off by the
  human owner (blueprint is investor-authoritative; substrate is a business
  decision, not only technical).
- **Rollback considerations:** An ADR is reversible on paper; its value is
  preventing *irreversible* code drift. If path (a) migrate is chosen, require
  a reversible, dual-write migration strategy before any cutover. If path (b)
  native is chosen, nothing in the repo changes yet — zero rollback surface.

> **Recommendation (advisory, owner decides):** Path **(b) Postgres-native
> RLS + additive realtime/cron** honors "additive evolution, don't rebuild,"
> minimizes migration risk, and preserves the 166-test backend — while still
> delivering the blueprint's *guarantee* (DB-enforced isolation). A full
> Supabase migration is the higher-risk, higher-fidelity alternative.

---

## TASK F1.2 — Tenant-Isolation Guardrails (interim safety)

- **Objective:** Regardless of F1.1's long-term path, immediately reduce the
  cross-tenant-leak risk by (design only in Phase 1): specifying a single
  **tenant-context** convention (one authoritative `restaurantId`/`tenant_id`
  resolved once per request) and an **automated query-scoping audit** that
  flags any Prisma query on a tenant-owned model lacking a tenant filter.
- **Why it exists:** Today isolation is 100% app-layer with no automated
  guard (Source-of-Truth §19.1). This is the top production risk. Even before
  RLS lands, a lint/test guard shrinks the blast radius.
- **Repository areas involved:** `apps/api/src/middleware/require-auth.ts`,
  `require-role.ts`, all `*.service.ts` under `modules/`, `lib/prisma.ts`.
- **Dependencies:** F1.1 (informs whether the guard is a stopgap or the
  permanent design under path b).
- **Acceptance criteria:**
  - A written convention for how tenant context is derived and passed.
  - A design for a CI check (test or lint rule) enumerating tenant-owned
    models and asserting scoping; documented list of the ~90 models and their
    tenant path.
- **Validation method:** Dry-run the enumeration against `schema.prisma`
  (models with a `restaurantId` path). Confirm no false "already safe"
  classifications.
- **Rollback considerations:** Guardrail is additive (CI/lint only); disabling
  it restores prior behavior with no data impact.

---

## TASK F1.3 — RLS Rollout Plan + Cross-Tenant Test Harness (design)

- **Objective:** Produce the concrete, phased plan to introduce RLS (or its
  path-(b) equivalent) table-by-table, plus the design of the **cross-tenant
  penetration test** the blueprint mandates (§18) — a test that attempts to
  read across tenants and **must fail**.
- **Why it exists:** RLS is the blueprint's #1 safety guarantee and the single
  highest-value foundation deliverable. It cannot be a big-bang; it needs an
  ordered, per-table rollout that never breaks the existing app-layer scoping.
- **Repository areas involved:** `apps/api/prisma/schema.prisma` + `migrations`
  (future), `.github/workflows/ci.yml` (add RLS test job), `docs/runbooks/`.
- **Dependencies:** F1.1 (mechanism), F1.2 (tenant-context convention).
- **Acceptance criteria:**
  - Ordered table list (start with highest-sensitivity: `Order`, `Payment`,
    `Customer`, `Restaurant`, catalog) with per-table policy shape.
  - Test-harness design: seed two tenants, assert every tenant-owned table
    denies cross-tenant reads/writes; wired as a CI gate.
  - Explicit "belt-and-suspenders" statement: app-layer scoping stays even
    after RLS.
- **Validation method:** Plan reviewed against every 🔴/🟠 isolation row in
  the gap matrix (A1, C2 financial firewall).
- **Rollback considerations:** RLS is added per-table behind migrations; each
  step is independently revertible. The harness is CI-only.

---

## TASK F1.4 — Tenant-Model Reshape Decision (Restaurant → tenant + locations)

- **Objective:** Decide and document whether/when to evolve the `Restaurant`
  tenant table toward a generalized tenant with a `locations` dimension and a
  `tenant_members(role)` model — including the migration approach that keeps
  every existing `restaurantId` FK working (additive alias, not rename).
- **Why it exists:** The current single-owner/single-location shape blocks
  multi-location (P3) and franchise (P4), and hard-codes the isolation key to
  one table (Source-of-Truth §18.2). Deciding the *shape* now prevents
  expensive reshaping later.
- **Repository areas involved:** `schema.prisma` (`Restaurant`, `User`,
  `MenuItemInventory`), all tenant-scoped services.
- **Dependencies:** F1.1 (substrate), F1.2 (isolation key).
- **Acceptance criteria:**
  - ADR stating: keep `Restaurant` as the tenant vs. introduce `tenant`/
    `locations`; the additive migration path; when (which later phase)
    multi-location lands.
  - Confirmation that any chosen path is **backward-compatible** with the 94
    existing `restaurantId` references.
- **Validation method:** Trace the proposed model against gap rows A2, I1, and
  the Enterprise franchise requirement (blueprint §20 P4).
- **Rollback considerations:** Decision-only in Phase 1; no schema change yet.

---

## TASK F1.5 — Bilingual / RTL Foundation Decision

- **Objective:** Decide the earliest-safe foundation for bilingual (EN/AR)
  data and RTL UI: at minimum, ratify adding `*_ar` columns (or a translations
  strategy) to catalog models and choosing a web i18n/RTL approach — so the
  blueprint's day-one bilingual requirement isn't a costly backfill later.
- **Why it exists:** Bilingual/RTL is a stated **unfair advantage** for the
  target Arabic/Yemeni GTM (blueprint §2, §11), yet nothing exists
  (Source-of-Truth §16, gap I2). Adding columns while data is small is cheap;
  retrofitting after thousands of tenants is not.
- **Repository areas involved:** `schema.prisma` (catalog models),
  `apps/web/src` (no i18n framework today), renderer content generation.
- **Dependencies:** F1.1, F1.4 (schema-shape decisions batch together).
- **Acceptance criteria:**
  - ADR choosing: parallel `*_ar` columns vs. a `translations` table; web i18n
    library + RTL strategy; whether AR content generation is P2 or P3.
  - Explicit note that Phase 1 only *ratifies* the approach; no columns added.
- **Validation method:** Cross-check against gap I2 and blueprint §11 RTL
  requirement.
- **Rollback considerations:** Decision-only; no code impact in Phase 1.

---

## TASK F1.6 — Documentation Truth Reset (governance hygiene)

- **Objective:** Reconcile the project's memory documents with verified
  reality: fix the stale repo identity (`ordervora/Ordervora-MVP` →
  `abukeeth/core`) and restaurant-only framing in `PROJECT_MEMORY.md`, and
  designate the source-of-truth hierarchy (these four Phase-1 docs +
  `RELEASE_NOTES.md`).
- **Why it exists:** Governance depends on trustworthy memory. Today
  `PROJECT_MEMORY.md` misstates the repo and product scope; only
  `RELEASE_NOTES.md` is reliable (Source-of-Truth §18.5). Agents/humans
  onboarding from bad memory make bad decisions.
- **Repository areas involved:** `PROJECT_MEMORY.md`, `ROADMAP.md`,
  `RELEASE_NOTES.md` (reference only), root docs, `docs/`.
- **Dependencies:** None (can run in parallel). Best done *after* this
  analysis is accepted.
- **Acceptance criteria:**
  - `PROJECT_MEMORY.md` states the correct repo, the multi-industry BOS scope,
    and the substrate reality; points to these four docs as authoritative for
    blueprint-alignment.
  - A one-paragraph "source-of-truth hierarchy" added.
- **Validation method:** Diff review; every corrected claim cites a file.
- **Rollback considerations:** Docs-only; git-revertible.

---

## TASK F1.7 — Production Stability Baseline

- **Objective:** Enumerate and triage the concrete production-stability items
  the foundation must clear before any feature phase: land the PR #6 auth-proxy
  fix (live register/login "Request failed"), and produce an honest
  **integration-status statement** so no environment advertises a capability
  backed only by a stub (delivery, SMS, POS).
- **Why it exists:** Production stability is priority #1 (CLAUDE.md). PR #6 is
  a verified live bug; stubs presented as integrations risk shipping
  storefronts that fail at checkout/dispatch (Source-of-Truth §20).
- **Repository areas involved:** `apps/web/next.config.ts`,
  `apps/web/src/lib/api.ts` / `server-api.ts` (PR #6), fulfillment/SMS/POS
  registries, storefront feature flags.
- **Dependencies:** None; F1.6 for the honesty statement.
- **Acceptance criteria:**
  - PR #6 reviewed and merged (or explicitly superseded) — it is low-risk,
    high-value.
  - A documented rule: a storefront may not enable delivery/SMS while those
    providers are stubs (feature-flag gate).
- **Validation method:** Re-run PR #6's own reproduction (single vs double
  slash); confirm stub providers are gated off in any customer-facing toggle.
- **Rollback considerations:** PR #6 is a minimal, tested change with its own
  rollback (revert commit). Gating is config-level.

---

## TASK F1.8 — Integration Readiness Ledger

- **Objective:** Produce a living ledger that, for each provider (payments,
  delivery, SMS, email, POS, import), records: real vs. stub, the exact
  interface contract, required env/secrets, and the "definition of done" to
  promote it from stub to real — so future phases implement against a fixed
  contract, not guesswork.
- **Why it exists:** The repo's adapter registries list many vendors; only
  Stripe (BYOP) + SMTP email are real (Source-of-Truth §12). A ledger turns
  "which of these actually work?" from tribal knowledge into governance.
- **Repository areas involved:** `commerce/payments/registry.ts`,
  `commerce/fulfillment/registry.ts`, `commerce/pos/registry.ts`,
  `commerce/notifications/registry.ts`, `imports/adapters/registry.ts`.
- **Dependencies:** F1.6.
- **Acceptance criteria:**
  - One table per registry listing each adapter's `implemented` status
    (verifiable from code) + promotion criteria + owning future phase.
- **Validation method:** Cross-check each entry against the code's
  `implemented` flag / `NotImplemented` throw.
- **Rollback considerations:** Docs-only.

---

## TASK F1.9 — Monetization Foundation Decision

- **Objective:** Decide the billing data contract (plans, subscriptions,
  entitlements/quotas) and where it lives, and how plan-gating will be
  expressed across modules and AI/SMS quotas — *without building it yet*. This
  is the bridge to "the first milestone after Phase 1."
- **Why it exists:** No billing exists; pilots can't be monetized and referral
  rewards are inert (gap J1, Source-of-Truth §20.1). The whole business model
  depends on it, so its data shape must be settled at foundation.
- **Repository areas involved:** `schema.prisma` (new plan/subscription models,
  future), `restaurants` module (referral reward hook), any future
  entitlement middleware, Stripe integration (relates H1 Connect vs BYOP).
- **Dependencies:** F1.1 (substrate), F1.4 (tenant shape — subscription hangs
  off the tenant).
- **Acceptance criteria:**
  - ADR: plan model (Starter/Growth/Pro/Enterprise), Stripe Billing vs. manual,
    trial/annual rules, entitlement/quota representation, relationship to
    Stripe Connect (H1).
- **Validation method:** Trace to gap J1/J2/G1 (AI quotas) and blueprint §5.
- **Rollback considerations:** Decision-only; sequenced as the first *build*
  after Phase 1 in `MASTER_EXECUTION_SEQUENCE.md`.

---

## TASK F1.10 — Security Baseline (MFA + posture confirmation)

- **Objective:** Define the admin-security baseline the platform must meet
  before scaling: MFA for `ADMIN` accounts, confirmation of webhook-signature
  coverage, secret-rotation runbook adequacy, and the AI prompt-injection
  isolation posture under the chosen substrate.
- **Why it exists:** Admin accounts control every tenant and have **no MFA**
  today (Source-of-Truth §15, gap J3). Webhook verification exists for
  payments; confirm it for all inbound webhooks. AI isolation ties to F1.1.
- **Repository areas involved:** `modules/auth`, `middleware/require-role.ts`,
  `commerce/payments/webhook.service.ts`, `lib/ai/*`,
  `docs/runbooks/secret-rotation.md`.
- **Dependencies:** F1.1 (AI-isolation mechanism).
- **Acceptance criteria:**
  - Documented baseline: MFA requirement for admin; inventory of inbound
    webhooks + which verify signatures; AI-isolation approach.
- **Validation method:** Grep-confirm current webhook verification coverage;
  confirm no MFA exists today; map AI calls to their isolation boundary.
- **Rollback considerations:** Baseline is a spec; implementation (MFA) is
  sequenced later and additive.

---

## Phase 1 exit criteria (definition of done)

Phase 1 is complete when **all** of the following are true — and note that
every deliverable is a **decision or document**, consistent with "no feature
work in Phase 1":

1. **F1.1 substrate ADR** signed off by the human owner.
2. RLS rollout + cross-tenant test **plan** exists (F1.3), with interim
   guardrail design (F1.2).
3. Tenant-model, bilingual, and monetization **decisions** recorded (F1.4,
   F1.5, F1.9).
4. Memory docs reconciled to reality; source-of-truth hierarchy set (F1.6).
5. PR #6 production fix resolved; integration-honesty gate defined (F1.7);
   integration ledger published (F1.8).
6. Security baseline (MFA + webhook + AI isolation) specified (F1.10).

At that point the program has a **trustworthy foundation**: a decided
substrate, a safety plan for tenant isolation, honest capability accounting,
and a clear first build (monetization) — with zero platform rebuild and zero
loss of existing functionality.
