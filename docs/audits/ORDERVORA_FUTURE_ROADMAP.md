# OrderVora — Future Roadmap (Evolve, Do Not Rebuild)

**Companion to:** `PHASE_01_REPOSITORY_DISCOVERY.md`, `PHASE_02_ARCHITECTURE_AUDIT.md`, `PHASE_03_DATABASE_AUDIT.md`
**Date:** 2026-07-17
**Premise:** The system is **not** rebuilt. Every change below extends the existing repository — the Express/Prisma API (`apps/api`), the Next.js app (`apps/web`), the ~70-model PostgreSQL schema, and the existing provider/adapter/job seams — treating them as the foundation.

**Why evolve rather than rebuild (grounded in the audits):** Phase 2 and Phase 3 both concluded the codebase is predominantly **KEEP**, with the heaviest change (tenancy) classified **EXTEND, not REPLACE** — *precisely because* the schema is internally consistent (`restaurantId` uniformly named across ~40 tables), the integration layer already uses registry/adapter seams, and the AI layer already sits behind one `getAIProvider()` abstraction. Those consistencies are what make an in-place transformation tractable. A rebuild would discard the mature commerce core (order state machine, transactional outbox, idempotency, payment failover, frozen financial snapshots) for no structural gain.

---

## Table of Contents
1. [The Central Constraint & the Target Model](#1-the-central-constraint--the-target-model)
2. [Transformation 1 — Multi-Organization / Multi-Business / Multi-Location SaaS](#2-transformation-1--multi-org--multi-business--multi-location-saas)
3. [Transformation 2 — AI Business Builder](#3-transformation-2--ai-business-builder)
4. [Transformation 3 — AI Brand Builder](#4-transformation-3--ai-brand-builder)
5. [Transformation 4 — AI Website Builder (consolidate & generalize)](#5-transformation-4--ai-website-builder-consolidate--generalize)
6. [Transformation 5 — AI Agent Platform](#6-transformation-5--ai-agent-platform)
7. [Migration Strategy (cross-cutting)](#7-migration-strategy-cross-cutting)
8. [Time-Boxed Plan — 30 / 60 / 90 / 180 Days](#8-time-boxed-plan--30--60--90--180-days)
9. [Implementation Order (dependency-ordered)](#9-implementation-order-dependency-ordered)
10. [Risk Register for the Transformation](#10-risk-register-for-the-transformation)

---

## 1. The Central Constraint & the Target Model

Everything the user asked for (multi-org, multi-business, multi-location, and four AI capabilities) sits on top of **one blocking constraint identified in Phase 3**:

> The tenant **is** the `Restaurant`. `Restaurant.ownerId @unique` hard-enforces one owner per business; `User.restaurantId` is a single nullable scalar (one user → at most one business); ~40 tables foreign-key directly to `restaurantId`; there is **no `Organization` and no `Location` model** (`schema.prisma:107, 40`).

Nothing else can be multi-tenant-correct until this is resolved. The target model:

```
Organization  (the billing & admin boundary — the "account")
 ├── Membership (User ↔ Organization, with role)   ← replaces User.restaurantId
 ├── Business A  (== today's "Restaurant" row, re-parented)
 │    ├── Location A1   (address, hours, tables, kitchen capacity, QR)
 │    └── Location A2
 ├── Business B
 └── Business C
```

**Key mapping decisions (chosen to minimize churn):**

| Concept | Maps to | Rationale |
|---|---|---|
| **Organization** | **New table** | The account/billing/subscription boundary. Owns Businesses. |
| **Business** | **Existing `Restaurant` table, re-parented** | Rename is *optional and deferred* — Phase 1 notes "renaming the table platform-wide was out of scope; only user-facing copy says Business." Keep the table name `Restaurant` internally to avoid a 40-table rewrite; add `organizationId`. |
| **Location** | **New table**, carved from the physical fields on `Restaurant` | `address`, `lat`, `lng`, `RestaurantHours`, `Table`, `KitchenCapacity`, `DeliveryConfig` are physically per-site and move to (or gain a nullable FK to) `Location`. |
| **Membership** | **New join table**, replaces `User.restaurantId` | Enables one user across many orgs/businesses with per-scope roles. |

**Non-negotiable principle for the whole transformation:** every step is **additive and backward-compatible first** (new nullable columns + backfill + dual-read), and only *later* tightens constraints — mirroring the repo's own proven migration discipline (Phase 3: 15/16 migrations purely additive, defaults + zero-backfill). No `DROP`/narrowing until a column is fully migrated and dual-read has been removed.

---

## 2. Transformation 1 — Multi-Org / Multi-Business / Multi-Location SaaS

This is the foundation; transformations 2–5 depend on it. Delivered in three additive waves.

### Wave A — Introduce Organization + Membership (the account layer)

**Database changes (all additive):**
- **New `Organization`** — `id`, `name`, `slug @unique`, `createdAt/updatedAt`. (Later gains subscription/billing fields — see §2 Billing note.)
- **New `Membership`** — `id`, `userId → User`, `organizationId → Organization`, `role OrgRole`, `@@unique([userId, organizationId])`. New enum `OrgRole { OWNER, ADMIN, MANAGER, STAFF }`. This is the *scoped* role that Phase 3 §5.2 found missing (today `User.role` is a single global enum).
- **`Restaurant.organizationId String?`** — new nullable FK → `Organization`. Nullable during migration; backfilled; tightened to required in a later migration once every row has one.
- Keep `Restaurant.ownerId` for now (dual-read); it becomes derivable from `Membership` and is dropped only in the final tightening migration.

**Migration strategy:**
1. Migration 1 (additive): create `Organization`, `Membership`, `OrgRole`; add `Restaurant.organizationId String?`.
2. Data backfill (idempotent script, same style as the existing `UPDATE Restaurant SET setupStep='DONE'` backfill in Phase 3 §9.1): for each existing `Restaurant`, create one `Organization` (name = restaurant name), one `Membership` (the current `ownerId` → OWNER), and set `Restaurant.organizationId`.
3. Dual-read window: `getOwnRestaurantId(userId)` (`restaurant.service.ts:42-45`) gains a sibling `getScopedBusinessIds(userId)` that reads `Membership`. Old path keeps working.
4. Migration 2 (tighten, later): `Restaurant.organizationId` → `NOT NULL`; add `@@index([organizationId])`.

**Architecture changes:**
- Introduce a **tenant-resolution seam** (the asymmetry Phase 2 §2.6 flagged: infra had seams, domain tenancy did not). A single `resolveScope(req)` middleware resolves `{ userId, organizationId, businessIds[], role }` from the session + `Membership`, replacing the ad-hoc `getOwnRestaurantId` call repeated in ~14 controllers (Phase 2 §2.2). This is the one place future scope logic lives.
- Authorization moves from "role is a global enum" to "role is per-membership" via `requireOrgRole(...)` alongside the existing `requireRole` (`middleware/require-role.ts`).

### Wave B — Introduce Location (the physical-site layer)

**Database changes (additive):**
- **New `Location`** — `id`, `restaurantId → Restaurant` (i.e. Business), `name`, `address`, `lat`, `lng`, `isPrimary`, `isActive`, timestamps. `@@index([restaurantId])`.
- **Re-home physically-per-site data** by adding a nullable `locationId` FK to the tables Phase 3 identified as location-physical: `RestaurantHours`, `Table`, `KitchenCapacity`, `DeliveryConfig`, `DeliveryZone`, `DeliveryFeeRule` (delivery economics are per-site). `Order` and `Fulfillment` gain nullable `locationId` for per-site attribution/reporting.
- Catalog (`MenuCategory`, `MenuItem`, `ModifierGroup`) stays business-scoped by default (a business's menu is usually shared across its locations), with an **optional** per-location availability override table introduced only if demanded (`LocationMenuItemAvailability`) — deferred, not in the critical path.

**Migration strategy:**
1. Additive migration: create `Location`; add nullable `locationId` to the per-site tables above.
2. Backfill: for each `Restaurant`, create one `Location` (the current single address/lat/lng), set every child row's `locationId` to it. This preserves today's exact behavior (one business = one location).
3. Dual-read: delivery/hours/capacity services read `locationId` when present, else fall back to the Restaurant's physical fields.
4. Tighten later: make `locationId` required on the per-site tables; deprecate `Restaurant.address/lat/lng` (keep as denormalized "primary location" cache or drop after dual-read removal).

**Architecture changes:**
- The Smart Routing Engine, hours logic, and kitchen-capacity reads switch from `restaurant.lat/lng` to `location.lat/lng` behind the same service interfaces — no controller signature change if `locationId` defaults to the business's primary location.
- Storefront/QR ordering resolves a `Location` (QR tokens already encode table→restaurant; extend to table→location).

### Wave C — Tenant-isolation hardening (defense-in-depth)

Phase 3 §4.2/§11.1 flagged that isolation is application-only, with denormalized `restaurantId` scalars lacking FKs. With the new hierarchy in place:
- Add real FK relations (+ indexes) to the denormalized tenant scalars (`OutboxEvent`, `Transaction`, `Fulfillment`, `NotificationLog`, `IdempotencyKey`) — Phase 3 REFACTOR item.
- Add the ~13 missing FK indexes (Phase 3 §10.2) — now doubly important because org/business/location queries add join fan-out.
- **Optional but recommended:** enable PostgreSQL **Row-Level Security** keyed on `organizationId`/`restaurantId` as a structural backstop, so a forgotten `where` clause can no longer leak across tenants. Introduced behind a session GUC set by the API per request. (This is the single highest-value integrity upgrade; it can trail the functional work.)

**Billing note:** `Organization` is the natural home for the subscription tiers the roadmap already prices (Starter/Growth/Pro/Enterprise — Phase 1 §11). Add `Subscription` (org-scoped, Stripe Billing) here; Phase 1/2 found **no billing module exists yet**, so this is greenfield but slots cleanly onto `Organization`.

---

## 3. Transformation 2 — AI Business Builder

**Definition:** an AI-guided flow that stands up a *complete* business (org + business + location + catalog + payments config + site) from minimal input — the natural generalization of today's Setup Wizard (`SetupStep` enum) + AI Import.

**What already exists to build on:** the Setup Wizard state machine (`SetupStep`: BUSINESS_TYPE→…→DONE), the AI import pipeline (9 source adapters, vision extraction), and the `getAIProvider()` seam. The AI Business Builder is an **orchestration layer over existing capabilities**, not new primitives.

**Database changes:**
- Generalize job tracking (see §6): a `BusinessBuildJob` (or a row-typed `AgentRun`) that sequences sub-steps (create org → create business → create location → import menu → suggest payment providers → generate site). Reuses the **durability pattern** already proven on `ImportJob`/`GenerationJob` (`attempts`/`startedAt`/`heartbeatAt` + reaper, Phase 3 §8).
- No new domain tables — it writes into the Org/Business/Location/Menu/Site tables from §2.

**Architecture changes:**
- New `business-builder` orchestrator module in `apps/api` that composes existing services (restaurants, imports, sites) — following the same "orchestrator composes services" pattern the payment orchestrator already demonstrates (Phase 2 §2.9).
- Depends entirely on §2 Wave A/B being in place (it creates org/business/location rows).

---

## 4. Transformation 3 — AI Brand Builder

**Definition:** generate and manage a coherent brand identity (palette, typography, voice, logo direction, tagline) as a first-class, reusable asset — decoupled from a single website.

**What already exists:** `Site.brandProfile Json` (Phase 3 §7.7), the `brand-analysis` and `content-generator` modules in `sites/`, and `SiteAsset` (LOGO/OG/FAVICON kinds). Today brand data is **trapped inside `Site`** (per-website), which Phase 3 flagged as siloing.

**Database changes (additive):**
- **Promote brand to a business-level entity:** new `Brand` table — `id`, `restaurantId → Restaurant` (Business), `palette Json`, `typography Json`, `voice Json`, `logoAssetId → SiteAsset?`, `version Int`, timestamps. `@@index([restaurantId])`.
- `Site.brandId String?` → `Brand` (nullable; a site *references* a brand instead of *owning* the profile). Backfill: for each `Site` with a `brandProfile`, create a `Brand` and point `Site.brandId` at it. Keep `Site.brandProfile` during dual-read, then deprecate.
- Version brands the same way themes are versioned (`Theme @@unique([key, version])`, Phase 3 §7.5) so brand changes don't retroactively mutate published sites.

**Architecture changes:**
- Extract brand generation from `sites/brand-analysis.ts` into a `brand` module reused by both the Business Builder and the Website Builder — resolving the Phase 2 §2.10 coupling where the renderer reaches into brand logic.
- Brand becomes an input to the Website Builder and to future AI agents (marketing copy uses the brand voice).

---

## 5. Transformation 4 — AI Website Builder (consolidate & generalize)

**Definition:** the website builder already largely exists and is strong (Phase 3 §7: correct versioning, native rollback, immutable released output, pinned themes). The transformation is **consolidation + multi-location awareness**, not new construction.

**Two problems to resolve (both already identified):**
1. **Two parallel flows** — `/dashboard/website/*` (manual Hub) and `/dashboard/builder/*` (AI Builder) — an open product decision the roadmap already lists (Phase 2 §2.10, Phase 1 §12). Consolidate to one flow with AI-assisted and manual modes, retiring the duplicate surface.
2. **Multi-location sites** — a `Site` is `@@unique` per `restaurantId` (Phase 3 §7). For multi-location businesses, decide: one site with per-location pages/content, or one site per location. Recommended: keep one `Site` per Business, add location-aware sections (hours/address/menu resolve per `Location`), since the renderer is already deterministic and data-driven.

**Database changes:**
- `Site` gains optional `Brand` reference (from §4) instead of embedding brand.
- Renderer reads location data (§2 Wave B) for address/hours/map sections.
- No change to the `SiteVersion`/`Theme`/`Domain` versioning model — it is a KEEP (Phase 3 §14).

**Architecture changes:**
- Unify the two flows behind one `sites` orchestration entry; the manual editor becomes a mode, not a separate module.
- Introduce a **read-model seam** so the renderer stops importing commerce/menu/loyalty services directly (Phase 2 §2.10 bidirectional-coupling finding) — the renderer consumes a `SitePageData` projection assembled by the sites orchestrator.

---

## 6. Transformation 5 — AI Agent Platform

**Definition:** a general substrate for autonomous/assistive AI features — the roadmap's "AI Marketing Assistant," "AI Analytics Assistant," "AI Restaurant Agent" — beyond the current website-generation-only pipeline.

**The gap (Phase 3 §8.2):** `GenerationJob`/`GenerationStage` is **website-specific** (its stages are BRAND_ANALYSIS/THEME_SELECTION/CONTENT_GENERATION/…). There is **no generic AI-job/agent table** and the `getAIProvider()` seam is **global** (one provider for all features, no per-feature model routing — Phase 2 §2.11).

**Database changes (additive, greenfield):**
- **New `AgentRun`** — `id`, `organizationId → Organization`, `restaurantId → Restaurant?`, `agentType AgentType`, `status`, `input Json`, `output Json?`, plus the **same durability fields** proven on the existing job tables (`attempts`, `startedAt`, `heartbeatAt`) and the **same cost telemetry** already on `GenerationJob` (`tokensUsed`, `costCents`, `timings`). Index `[status, heartbeatAt]` for the shared reaper.
- **New `AgentMessage`** (conversation/step log, append-only) for multi-turn agents — `agentRunId`, `role`, `content Json`, `createdAt`. Append-only, indexed `[agentRunId, createdAt]` (same pattern as `OrderEvent`).
- Enum `AgentType { WEBSITE_GENERATION, BUSINESS_BUILDER, BRAND_BUILDER, MARKETING_ASSISTANT, ANALYTICS_ASSISTANT, MENU_IMPORT }` — retrofit the existing website/import pipelines as agent types over time (they can keep their current tables and gain an `AgentRun` umbrella).
- Add a `maxAttempts`/dead-letter terminal state the current job tables lack (Phase 3 §8.3).

**Architecture changes:**
- **Generalize the AI seam:** extend `getAIProvider()` to `getAIProvider(feature)` so per-agent model routing is expressible (cheap model for scoring, vision model for import) — Phase 2 §2.11 limitation. Add retry/backoff and token-budget governance at the seam.
- **A dedicated agent worker.** This is where the Phase 2 §2.12 constraint becomes mandatory, not optional: the current schedulers are **in-process `setInterval` pollers, explicitly single-process** (`outbox-scheduler.ts:12-19`). An agent platform runs long, expensive, bursty jobs that must **not** share the API process. Extract agent execution (and, opportunistically, the existing import/generation runners) into a **separate worker deployment** with claim-coordinated polling (the import/generation claim pattern already exists; the periodic pollers need it added). This unblocks horizontal scaling of both the API and the agents.

---

## 7. Migration Strategy (cross-cutting)

The whole program follows the repo's **existing, proven** migration discipline (Phase 3 §9): additive-first, defaulted/nullable columns, zero-backfill-breakage, no destructive ops until dual-read is retired.

**The universal three-step pattern for every schema change:**
1. **Expand** — add new tables/columns as nullable/defaulted (safe, reversible, deploys with old code still running).
2. **Migrate + dual-read** — backfill via idempotent scripts (style of the existing `setupStep='DONE'` backfill); ship code that writes new + reads new-else-old.
3. **Contract** — once 100% migrated and dual-read is removed, tighten (`NOT NULL`, add indexes, drop deprecated columns).

**Operational guardrails the audits flagged as currently missing (adopt for this program):**
- Use `CREATE INDEX CONCURRENTLY` (raw SQL migrations) for every index added to an already-populated table — Phase 3 §9.4 found no existing example, and the org/location/FK-index work adds indexes to large live tables.
- Keep a written reverse plan per migration (Prisma has no down-migrations, Phase 3 §9.3); the additive-first pattern makes rollback = drop-the-additions until the contract step.
- Backups/PITR verified before each **contract** (tightening) migration — those are the only non-trivially-reversible ones.

---

## 8. Time-Boxed Plan — 30 / 60 / 90 / 180 Days

Sequencing is dependency-driven: tenancy foundation first (nothing multi-* is correct without it), then AI capabilities layered on top.

### 30 Days — Tenancy foundation (Expand phase) + isolation quick wins
- **Organization + Membership tables** and `Restaurant.organizationId?` (additive migration + backfill). *(Transformation 1, Wave A steps 1-3.)*
- **Tenant-resolution seam** (`resolveScope` middleware, `getScopedBusinessIds`) with dual-read; existing `getOwnRestaurantId` untouched.
- **`requireOrgRole` authorization** alongside existing `requireRole`.
- **Isolation quick wins (Phase 3 REFACTOR):** add the ~13 missing FK indexes and FK relations for the denormalized `restaurantId` scalars — independent, low-risk, high-value, parallelizable with the above.
- **Billing scaffold on Organization** (subscription table shell; wire later).
- *Exit criteria:* every existing single-business account runs unchanged, now backed by an Organization+Membership behind the scenes.

### 60 Days — Location layer + tenancy tighten + Website consolidation
- **Location table** + nullable `locationId` on per-site tables; backfill one location per business; dual-read in delivery/hours/capacity. *(Transformation 1, Wave B.)*
- **Contract migration for Wave A:** `Restaurant.organizationId` → NOT NULL, indexes added; `Membership` becomes the authoritative scope.
- **Website Builder consolidation** — merge the two flows (`/dashboard/website` + `/dashboard/builder`) into one; introduce the renderer read-model seam (decouples renderer from commerce services). *(Transformation 4.)*
- *Exit criteria:* a business can hold multiple locations; storefront/QR/delivery resolve per-location; one unified website flow.

### 90 Days — AI generalization + Brand as first-class + Agent substrate
- **Generalize the AI seam** to `getAIProvider(feature)` with retry/backoff + token budgets. *(Transformation 5 arch.)*
- **`Brand` table** + `Site.brandId?`; backfill from `Site.brandProfile`; extract a reusable `brand` module. *(Transformation 3.)*
- **`AgentRun`/`AgentMessage` tables + `AgentType`** with the shared durability/cost pattern and dead-letter state. *(Transformation 5 DB.)*
- **Dedicated worker deployment** — extract job/agent execution out of the API process; add claim-coordination to the periodic pollers. *(Unblocks horizontal scaling — Phase 2 §2.12.)*
- *Exit criteria:* AI features route per-feature; brand is reusable business-level; a generic agent job substrate exists; workers scale independently of the API.

### 180 Days — AI Business Builder, Agent Platform features, multi-location depth, RLS
- **AI Business Builder** orchestrator — one flow stands up org→business→location→menu→payments→site, sequenced via `AgentRun`. *(Transformation 2.)*
- **First real AI agents** on the substrate — Marketing Assistant and Analytics Assistant as `AgentType`s; retrofit website-generation and menu-import as agent types over their existing tables.
- **Multi-location depth** — optional per-location menu availability, per-location sites/pages, location-aware analytics rollups.
- **Row-Level Security** on `organizationId`/`restaurantId` as the structural isolation backstop; **retention/partitioning** for the append-only tables Phase 3 §11.4 flagged (`DriverLocationPing`, `OrderEvent`, `OutboxEvent`, `NotificationLog`) — now larger under multi-tenant load.
- **Contract migrations** for Location (`locationId` NOT NULL) and Brand (drop `Site.brandProfile`) after dual-read removal.
- *Exit criteria:* full multi-org/business/location SaaS with an AI agent platform, all on the original codebase.

---

## 9. Implementation Order (dependency-ordered)

The strict dependency chain (each depends on the prior):

1. **Organization + Membership + tenant-resolution seam** → nothing multi-* is correct without it.
2. **FK indexes + denormalized-scalar FKs + (later) RLS** → isolation hardening; partly parallel to (1), fully lands after the hierarchy exists.
3. **Location layer** → depends on (1); re-homes physical data.
4. **Website Builder consolidation + renderer read-model seam** → depends on (3) for location-aware rendering; independent of AI generalization otherwise.
5. **AI seam generalization (`getAIProvider(feature)`) + dedicated worker** → prerequisite for any serious AI expansion; depends on nothing but unblocks (6)-(8).
6. **Brand as first-class** → depends on (5) for generation, feeds (4) and (7).
7. **AgentRun/AgentMessage substrate** → depends on (5); generalizes existing job tables.
8. **AI Business Builder** → depends on (1)+(3)+(6)+(7); it orchestrates all of them.

**Parallelization:** track (2) runs alongside (1). Track (5) can start as soon as (1) is stable, in parallel with (3)/(4). Everything AI (6-8) waits on (5).

---

## 10. Risk Register for the Transformation

| # | Risk | Mitigation |
|---|---|---|
| 1 | **The 40-table `restaurantId` re-parenting is broad** | Keep `Restaurant` as the Business table (no rename); only *add* `organizationId`/`locationId`. Expand→dual-read→contract per §7. Never a big-bang cutover. |
| 2 | **Dual-read windows leave two code paths temporarily** | Time-box each contract migration; delete the old path in the same PR that flips NOT NULL. Track debt explicitly. |
| 3 | **Index creation locks large live tables** | `CREATE INDEX CONCURRENTLY` for every populated table (§7) — a gap the audits found in existing migrations. |
| 4 | **Worker extraction changes the runtime topology** | The claim/heartbeat/reaper durability already exists for import/generation jobs; extend it to the periodic pollers *before* running two instances (Phase 2 §2.12). |
| 5 | **AI cost/latency explosion on the agent platform** | Cost telemetry already exists on `GenerationJob` (`tokensUsed`/`costCents`); make it mandatory on `AgentRun` + per-feature token budgets at the seam. |
| 6 | **Provider stubs mistaken for capability** | Phase 2: only Stripe + email are live. Multi-location/billing expansion should not assume POS/fulfillment/SMS providers work — implement or clearly gate them. |
| 7 | **Tenant data leakage during migration** | Ship RLS (180-day) as the structural backstop; until then, the `resolveScope` seam centralizes scoping so it's audited in one place, not 14 controllers. |
| 8 | **Append-only tables balloon under multi-tenant load** | Retention/partitioning for `DriverLocationPing`/`OrderEvent`/`OutboxEvent`/`NotificationLog` (Phase 3 §11.4) scheduled into the 180-day window. |

---

## Summary

Every requested capability is reachable **without a rebuild**, because the audits established the codebase is fundamentally **KEEP/EXTEND**:

- **Multi-Org / Business / Location** = insert `Organization` + `Location` + `Membership` above the existing, uniformly-scoped `Restaurant` spine (Expand→dual-read→Contract). *Foundation — 30/60 days.*
- **AI Website Builder** = consolidate the two existing flows and make the (already strong, already versioned) renderer location- and brand-aware. *60/90 days.*
- **AI Brand Builder** = promote the brand profile trapped in `Site` to a reusable, versioned business-level `Brand`. *90 days.*
- **AI Agent Platform** = generalize the website-specific `GenerationJob` into an `AgentRun` substrate reusing the proven durability/cost pattern, behind a per-feature AI seam, on a dedicated worker. *90/180 days.*
- **AI Business Builder** = an orchestrator composing all of the above — the capstone. *180 days.*

The critical path is **tenancy first**; the AI capabilities layer cleanly on top once the account/business/location hierarchy and the generalized AI seam exist. Nothing here discards the mature commerce core, the payment/integration seams, or the deterministic website engine — it extends them.

---

*This roadmap is a planning document derived from Phases 1–3. It prescribes no code changes in this commit; it defines the sequence, dependencies, and migration strategy for an in-place evolution.*
