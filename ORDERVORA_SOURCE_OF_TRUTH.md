# OrderVora — Source of Truth

> **Document type:** Governance / program foundation (Phase 1, Deliverable 1)
> **Authority:** The attached **OrderVora Master Blueprint** is the product
> authority. This document is the *engineering* source of truth: it records
> what the **repository actually implements today**, measured against that
> blueprint, using repository evidence only.
> **Scope of this document:** Documentation only. No application code,
> migrations, or PRs were created to produce it.
> **Repository analyzed:** `abukeeth/core` — branch
> `claude/ordervora-blueprint-gaps-kwyve1` (based on `main` @ `f126fef`).
> **Date:** 2026-07-19

---

## 0. How to read this document

Every major capability is classified with one of:

| Status | Meaning |
|---|---|
| **COMPLETE** | Implemented end-to-end with real logic and tests; usable in production subject to config. |
| **PARTIAL** | Real implementation exists but is incomplete vs. the blueprint, or built on a different architecture than the blueprint prescribes. |
| **STUB** | Code/interface exists but throws "not implemented" or returns a soft failure; a registered placeholder only. |
| **NOT STARTED** | No code exists for this capability. |
| **NEEDS VERIFICATION** | Evidence is ambiguous or depends on runtime/env not observable from the repo. |

**Verified fact** = directly observed in the repository (file cited).
**Assumption / inference** = reasoning beyond direct evidence; labelled as such.

> ⚠️ **Single most important finding up front:** The repository is a mature,
> well-tested **Node/Express + Prisma + PostgreSQL** monolith deployed to
> **Render + Vercel**. The blueprint prescribes **Supabase (Postgres + RLS +
> Edge Functions + Realtime + pgvector) + Stripe Connect + Claude API**. The
> *product surface* is ~90% aligned; the *platform substrate* is
> fundamentally different. The blueprint's central security claim —
> "isolation is enforced in the database via RLS, not in code" — is **not**
> how this repository works. Tenant isolation here is **application-layer
> Prisma scoping by `restaurantId`**. This single divergence drives most of
> the risk analysis below.

---

## 1. Blueprint Summary

The Master Blueprint defines OrderVora as an **AI-powered Business Operating
System (BOS)** for local U.S. businesses (restaurants, delis, vape/smoke
shops, groceries, bakeries, cafés, retail) — not a restaurant-ordering app.
Its thesis: let owners **own their customers, brand, and profits** instead of
renting them from DoorDash/Uber Eats/Grubhub (which take 15–30% commissions).

Blueprint pillars:
- **Ownership** — the business owns 100% of customer data and brand.
- **Magic** — a full digital business built in **under 15 minutes** from a
  menu photo / Google Business link / Clover account.
- **Luxury** — every store looks Apple/Stripe-grade, never a generic template.

Blueprint's prescribed architecture (§6, §7, §8, §17):
- **Next.js 15 (App Router)** on **Vercel Edge**, multi-tenant.
- **Supabase**: Postgres + **RLS** + Auth + **Realtime** + Storage + **Edge
  Functions** + **pgvector**.
- **Stripe Connect** (per-business connected accounts + platform margin).
- **Claude API** (Vision + generation + tools) as "the heart of the product."
- **Twilio** (SMS) + **Resend** (Email); **Uber Direct + DoorDash Drive**
  (delivery-as-a-service, both from day one with fallback).
- Single shared DB with `tenant_id` on every table + mandatory RLS.
- Bilingual **(English/Arabic) with real RTL from day one** (`name` / `name_ar`).
- Three AI layers: (1) **Onboarding Engine**, (2) **Brand & Site Generator**,
  (3) **AI Business Consultant** (reactive chat + proactive scheduled insights
  with one-click execution).

Blueprint roadmap: MVP+ (restaurants/delis) → Growth (delivery/marketing) →
Horizontal expansion (Clover import, vape/retail, custom domains,
multi-location) → Enterprise (franchise, POS, public API).

---

## 2. Product Vision

**Verified alignment:** The repository's own memory files echo the vision but
in a **narrower, restaurant-first framing**. `PROJECT_MEMORY.md` states the
purpose as *"AI-powered restaurant operating system and direct ordering
platform,"* and even records a stale repository identity
(`ordervora/Ordervora-MVP`) that does not match `abukeeth/core`.

**Where the repo is already broader than "restaurants":** the schema's
`BusinessType` enum (`apps/api/prisma/schema.prisma:235`) supports
`RESTAURANT, COFFEE_SHOP, DELI, VAPE_SHOP, CONVENIENCE_STORE, BAKERY, PIZZA,
RETAIL, OTHER` — a genuine multi-industry foundation matching the blueprint's
target segments. However, the underlying tenant table is still literally
named `Restaurant`, and the code comment at `schema.prisma:110` confirms:
*"renaming the table platform-wide was out of scope; only user-facing copy
says 'Business'."*

**Assessment:** Product vision is **PARTIAL** in the codebase — the
multi-industry data model exists, but the platform's internal vocabulary,
memory docs, and much of the domain logic remain restaurant-centric.

---

## 3. Repository Architecture

**Verified facts:**
- pnpm **monorepo** (`pnpm-workspace.yaml`) with two apps:
  - `apps/api` — Node.js / **Express** / TypeScript / **Prisma** backend.
  - `apps/web` — **Next.js 15 (App Router)** / React / TypeScript / Tailwind.
- Shared `tsconfig.base.json`; per-app ESLint + Vitest configs.
- Deployment manifests present for **Render** (`render.yaml`), **Railway**
  (`railway.json`, `RAILWAY_DEPLOYMENT.md`), **Docker** (`docker-compose.yml`,
  per-app `Dockerfile`), and **Vercel** (`apps/web/vercel.json`,
  `framework: nextjs`).
- Extensive documentation tree under `docs/` (runbooks, audits, reports) plus
  large root-level history (`RELEASE_NOTES.md` is ~211 KB).

**Architecture shape:** A **classic client/server split** — Next.js web app
calls an Express API over `/api/*` (via Next `rewrites()` proxy, per PR #6),
which talks to Postgres through Prisma. This is **not** the blueprint's
"Vercel Edge + Supabase Edge Functions" serverless topology.

**Backend module layout** (`apps/api/src/modules/`): `auth`, `restaurants`,
`menu`, `imports`, `onboarding`, `sites`, `admin`, and a large `commerce`
domain (`orders`, `checkout`, `cart`, `payments`, `pos`, `coupons`,
`loyalty`, `reviews`, `fulfillment`, `delivery-rules`, `notifications`,
`qr-ordering`, `analytics`, `menu-commerce`, `events`).

---

## 4. Backend Architecture

**Verified facts:**
- **Express app** assembled in `apps/api/src/app.ts` with a clear middleware
  chain: request-correlation, HTTP metrics, security headers, CORS, body
  parsing, `cookieParser`, a site-edge middleware for custom-domain routing,
  then route mounting (`app.ts:150–320`).
- **Routing convention:** owner/tenant routes under `/api/restaurants/*`,
  public storefront routes under `/api/public/*`, customer routes under
  `/api/customer/*`, admin under `/api/admin/*`, payment webhooks under
  `/api/webhooks/payments`.
- **Auth:** JWT access/refresh tokens in **httpOnly cookies**
  (`middleware/require-auth.ts`, `modules/auth/cookies.ts`), role-gated by
  `middleware/require-role.ts` against the `Role` enum
  (`ADMIN`, `RESTAURANT_OWNER`, `RESTAURANT_STAFF`).
- **Reliability primitives present and real:** an **outbox pattern**
  (`commerce/events/outbox-worker.ts`, `outbox-scheduler.ts`),
  **idempotency keys** (`middleware/require-idempotency-key.ts`, `IdempotencyKey`
  model), **rate limiting** (`middleware/rate-limit.ts`), **job durability**
  with claim/heartbeat/reaper (`lib/job-durability.ts`, `lib/job-reaper.ts`),
  **webhook signature verification** (`commerce/payments/webhook.service.ts`),
  and **fraud signals** (`FraudSignal` model).
- **Provider-abstraction pattern is pervasive and consistent:** payments,
  POS, fulfillment, notifications, imports, and AI each use a
  registry/adapter interface so a new vendor is "one class + one register()
  line." This is a genuine architectural strength.

**Assessment: COMPLETE** as an Express backend architecture — mature,
patterned, and well-instrumented. **PARTIAL** vs. blueprint (no Edge
Functions; scheduling is in-process schedulers, not `pg_cron`/QStash).

---

## 5. Frontend Architecture

**Verified facts:**
- Next.js 15 App Router (`apps/web/src/app`). Storefront routes under
  `/order/*` and `/store`; owner dashboard under `/dashboard/*`; auth flows
  (`/login`, `/register`, `/forgot-password`, `/reset-password`,
  `/verify-email`); onboarding under `/setup/*`.
- **Same-origin API proxy** design: browser calls relative `/api/*`, Next
  `rewrites()` forwards to the Express API (documented in PR #6).
- Dashboard pages present (`apps/web/src/app/dashboard/*/page.tsx`):
  `analytics, builder, coupons, delivery, driver, import, kitchen,
  kitchen-capacity, launch, loyalty, menu, orders, payments, pos, profile,
  referrals, restaurant, staff, tables, website`.
- Shared owner nav via `components/dashboard-nav.tsx` (desktop pill nav +
  mobile bottom tab bar), with `dashboard-overview.tsx` carrying its own
  separate layout (a known duplication, per `PROJECT_MEMORY.md`).
- **Real-time updates are by polling**, not push:
  `dashboard/kitchen/page.tsx:99` uses `setInterval` auto-refresh. No
  `EventSource`/WebSocket/Supabase Realtime found in the web app.

**Notably absent dashboard sections** (vs. blueprint screen map §10):
- **No `marketing` page** (campaigns/automations).
- **No `customers` CRM page** (customer list/segments/profiles).
- **No AI Consultant page** (chat + recommendation cards).

**Assessment: PARTIAL.** The owner dashboard and storefront are broad and
real, but three blueprint-central owner surfaces (Marketing, Customers CRM,
AI Consultant) have no page, and live updates use polling rather than the
blueprint's Realtime.

---

## 6. Database Architecture

**Verified facts:**
- **PostgreSQL via Prisma** (`datasource db { provider = "postgresql" }`).
  `PROJECT_MEMORY.md` explicitly states the DB is provider-agnostic via a
  single `DATABASE_URL` and *"No provider-specific SDK is used; do not assume
  Supabase."*
- `schema.prisma` is **2,130 lines**, ~90 models/enums — a large, mature
  relational model covering identity, catalog, commerce, payments,
  fulfillment, loyalty, sites/domains, imports, onboarding, and admin audit.
- **17 ordered migration folders** under `apps/api/prisma/migrations/`
  (`20260703…_init` → `20260718…_onboarding_status`), governed by a
  **CI migration-check** that fails any `schema.prisma` diff lacking a paired
  migration (`.github/workflows/ci.yml`).

**Divergences from blueprint DB design (§7) — all verified:**
- **Tenant unit is `Restaurant`** (one owner per restaurant:
  `Restaurant.ownerId String @unique`, `schema.prisma:107`). Isolation is by
  `restaurantId` foreign keys (94 occurrences), scoped in application code.
- **No `tenant_id` generalization, no RLS policies** anywhere in schema or
  migrations (`grep` for RLS/`USING (` returns only comments).
- **No `locations` table** — the blueprint's per-tenant multi-location model
  is absent; a restaurant carries a single `lat/lng/address`. Multi-location
  is NOT STARTED.
- **No bilingual columns** — zero `name_ar`/`nameAr` in schema, despite the
  blueprint mandating `name` / `name_ar` "from day one."
- **No `embedding vector` / pgvector** — no semantic search / AI embeddings.
- **No marketing tables** (`campaigns`, `automations`), **no AI tables**
  (`ai_conversations`, `ai_insights`), **no `onboarding_jobs`** as specified
  (there is an `ImportJob` + `OnboardingStatus`, which overlap partially).
- **No billing/subscription tables** (`subscription`, `plan`) — see §13.

**Assessment: PARTIAL.** The relational model is rich and well-migrated, but
it is a **restaurant-scoped Prisma schema**, not the blueprint's
**tenant-scoped, RLS-enforced, bilingual, pgvector-enabled** Supabase schema.

---

## 7. Current Tenant Model

**Verified facts:**
- **Tenant = `Restaurant`**, keyed by a unique owner (`ownerId @unique`).
- Members: `User.restaurantId` + `Role` enum (`ADMIN`, `RESTAURANT_OWNER`,
  `RESTAURANT_STAFF`). There is **no separate `tenant_members` join with
  granular roles** (owner/manager/staff/kitchen) as the blueprint describes;
  "kitchen" is a UI/route concern, not a distinct DB role.
- Isolation enforced in **application code**: every service query filters by
  `restaurantId`, guarded by `requireAuth` + `requireRole`.
- Platform-level controls exist: `Restaurant.isSuspended` (admin kill switch),
  `AdminAuditLog`, admin routes.

**Divergence:** Blueprint §6/§19 mandate **RLS at the database layer** as the
isolation guarantee ("security enforced in the database, not the code") and a
**locations**-aware, `tenant_id`-generalized model. Neither is present.

**Assessment: PARTIAL / at architectural risk** (see §21). Isolation *works*
today but relies entirely on correct application-code scoping — the exact
posture the blueprint set out to eliminate.

---

## 8. Theme Engine Status

**Verified facts:**
- A real, iterated theme system lives in `apps/api/src/modules/sites/`:
  `theme-catalog.ts` (388 lines), `theme-matching.ts` (186 lines),
  `renderer/theme-css.ts`, plus a `Theme` model in the schema.
- Recent merged history shows active investment: **Theme Engine V3** —
  `restaurant-maison` premium catalog entry (#15), business-type-aware theme
  selection (#17), and a V3 architecture doc (#16) are all on `main`.
  A `docs/audits/THEME_ENGINE_V3_ARCHITECTURE.md` documents the direction.
- The storefront renderer (`sites/renderer/`) has ~40 component/section
  modules and multiple design systems (`renderer/design-systems.test.ts`).

**Caveat:** PR **#14 ("Theme Engine V2")** is still **open** but appears
**superseded** — V3 work (#15–#17) merged after it. See §19.

**Assessment: COMPLETE (for v1 scope) / PARTIAL vs. blueprint.** A working,
premium, business-type-aware theme/rendering engine exists. The blueprint's
"infinite design genes + AI-proposed full brand identity (palette, fonts,
tone) in EN+AR" is only partially realized (see §11 AI Status).

---

## 9. Commerce Status

**Verified facts — this is the strongest area of the repo.** The `commerce`
domain implements, with real logic and tests:
- **Cart & checkout:** `cart/`, `checkout/` (quote service, tax, guest
  sessions, cart identity).
- **Orders:** `orders/` with an explicit **order state machine**
  (`order-state-machine.ts`), order numbering, order events/timeline,
  `OrderStatus`/`OrderFulfillmentStatus`/`OrderPaymentStatus` enums.
- **Payments orchestration:** `payments/orchestrator.ts`, provider registry,
  attempts, refunds, transactions, tips, taxes, webhook handling.
- **Menu-commerce:** modifiers, variants, inventory, public menu.
- **Coupons & gift cards**, **loyalty** (program/accounts/transactions),
  **reviews**, **delivery-rules** (zones, fee rules, service fees, smart
  routing geometry, kitchen capacity), **QR ordering** (tables + tokens).

**Assessment: COMPLETE (core commerce).** Pickup, QR dine-in, cart, guest
checkout, coupons, loyalty, reviews, and tax/fee logic are genuinely
implemented. Gaps are in **external integrations** (delivery/payment
providers — §11) and **realtime tracking** (polling only — §5).

---

## 10. Website Builder Status

**Verified facts:**
- Full generation pipeline in `sites/`: `generation.service.ts`,
  `generator.ts`, `content-generator.ts`, `brand-analysis.ts`, `assemble.ts`,
  `ingest.ts`, `section-rules.ts`, `layout-engine.ts`.
- **Renderer** (`sites/renderer/`): ~40 modules incl. hero, menu-section,
  featured-products/categories, gallery, reviews, hours-location, CTA,
  footer, `json-ld.ts`, `seo-head.ts`, `sitemap.ts`, `og-image.ts`,
  `theme-css.ts`.
- **Publishing engine** + **versioning** (`SiteVersion`, statuses),
  **preview tokens**, **approval-before-publish** (migration
  `…_website_builder_preview_approval`).
- **Custom domains & TLS:** `domain.service.ts`, `ssl-issuance-scheduler.ts`,
  `Domain`/`DomainEvent` models, verification + TLS status enums
  (Sprint 20A domain engine).
- **Site scoring:** `sites/scoring/` — SEO, accessibility, performance,
  brand-consistency, conversion aggregated into a `SiteScore`.
- **Customization studio** in the web app
  (`dashboard/website/editor/studio/`).

**Assessment: COMPLETE / PARTIAL vs. blueprint.** A real, structured
(content-as-JSON), SEO-aware, multi-page generator with domains, scoring, and
guided customization — closely matching the blueprint's "smart generator, not
drag-and-drop." Not yet realized: **bilingual EN/AR content generation** and
**AI image generation** for missing product photos (blueprint §8 Layer 2).

---

## 11. AI Status

**Verified facts:**
- **Provider abstraction** (`apps/api/src/lib/ai/`): a single `getAIProvider()`
  selection point with **OpenAI (first priority), Anthropic, Gemini**
  providers (`lib/ai/index.ts`). Swappable by env var.
- **Onboarding Engine (Layer 1) — REAL:** `imports/vision-extractor.ts`
  sends menu images/text to the AI provider and parses structured JSON
  (categories/items/prices/business profile). Import adapters for **PDF,
  Image, CSV, Website scrape, Google Maps** are implemented.
- **Brand & Site Generator (Layer 2) — PARTIAL:** `sites/brand-analysis.ts` +
  `content-generator.ts` do AI-assisted brand/content generation; a
  **brand-consistency AI "judge"** exists in scoring. **Missing:** bilingual
  generation, AI product-image generation.
- **AI Business Consultant (Layer 3) — NOT STARTED:** no `ai_conversations`,
  no `ai_insights`, no reactive chat, no proactive scheduled insight
  generation, no "one-click execute" recommendation cards. No dashboard page.

**Divergence from blueprint:** Blueprint names **Claude API** as "the heart of
the product" and routes every AI call through a **tenant-scoped Supabase Edge
Function**. Here, AI is provider-agnostic (defaults to **OpenAI**), runs
in-process in Express, and is scoped by application code, not an Edge Function
boundary.

**Assessment: PARTIAL.** Layer 1 real, Layer 2 partial, Layer 3 not started.

---

## 12. Integrations Status

| Integration | Blueprint intent | Repo state | Classification |
|---|---|---|---|
| **Stripe** | Stripe **Connect** (platform + margin) | Real Stripe SDK, `paymentIntents` capture/cancel/refund (`payments/providers/stripe.provider.ts`) but **BYOP model** (merchant connects *own* credentials via `provider.service.ts`), **not** Connect/platform accounts | **PARTIAL** |
| Adyen / Authorize.net / Clover / Fiserv / Square (pay) | — | Registered **stubs** | **STUB** |
| **Uber Direct** | Delivery day one | `fulfillment/providers/uber-direct.provider.ts` throws `NotImplemented` | **STUB** |
| **DoorDash Drive** | Delivery day one | Stub (`NotImplemented`) | **STUB** |
| Local courier | fallback | Stub | **STUB** |
| **Twilio (SMS)** | SMS + TCPA | `notifications/providers/sms.provider.ts` — **stub** (`implemented=false`) | **STUB** |
| **Resend (Email)** | Marketing email | **Email is real but via SMTP/nodemailer** (`email.provider.ts`), **transactional only**, not Resend, no marketing email | **PARTIAL** |
| Push notifications | — | Stub | **STUB** |
| **Google Business Profile** | Import name/hours/reviews | `GOOGLE_MAPS` import adapter + Places client implemented | **PARTIAL/COMPLETE** |
| **Clover import** | Catalog+inventory sync (Phase 3) | **No Clover import adapter** (not in `imports/adapters/registry.ts`); Clover exists only as a payment/POS **stub** | **NOT STARTED** |
| DoorDash / UberEats / Grubhub **import** | Menu import | Adapters exist but throw `NotImplemented` | **STUB** |
| **POS** (Clover/Square/Toast/Lightspeed) | Phase 3+ | All provider adapters are **stubs** | **STUB** |
| Object storage | Supabase Storage | **S3-compatible** client + local-disk fallback (`lib/object-storage-client.ts`, `lib/file-storage.ts`) | **PARTIAL (different vendor)** |

**Assessment: PARTIAL overall.** Real: Stripe (BYOP), SMTP email, Google
Maps/GBP import, S3 storage, menu-photo/PDF/CSV/website import. Everything
delivery-, SMS-, POS-, and Clover-related is a stub.

---

## 13. Deployment Status

**Verified facts:**
- **API → Render (Docker)** is the documented primary backend target
  (`PROJECT_MEMORY.md`, `render.yaml`, `docs/runbooks/render-deploy.md`);
  also runs on any Docker host and has **Railway** config
  (`railway.json`, `RAILWAY_DEPLOYMENT.md`, `6acf64b` "Railway API-only").
- **Web → Vercel** (`apps/web/vercel.json`).
- **CI** (`.github/workflows/ci.yml`): migration-check + validate / lint /
  typecheck / test / build against a **real Postgres 16 service**, and
  `prisma migrate deploy`. **`deploy.yml`** also present.
- No Supabase project wiring, no Edge Function deploys, no Vercel-Edge runtime.

**Divergence:** Blueprint prescribes **Vercel Edge + Supabase + Staging/Prod
Supabase projects + automated RLS tests on every deploy**. The repo's CI is
strong but has **no RLS tests** (because there is no RLS) and deploys a
containerized Express API to Render/Railway.

**Assessment: PARTIAL / production-capable on its own stack.**

---

## 14. Testing Status

**Verified facts:**
- **166 API test files** and **43 web test files** (Vitest). PR #14 reports an
  API suite of **~1,265 passing / 5 skipped**; PR #2 reports web **227
  passing**. (Counts are self-reported in PRs; the file counts are verified.)
- Tests cover state machines, registries, adapters, scoring, geometry, auth,
  rate limiting, import parsing, and renderer output.
- CI runs the full suite against real Postgres.

**Gap vs. blueprint:** No **RLS penetration tests** (blueprint §18 requires an
automated cross-tenant read test that must fail on every deploy). No evidence
of end-to-end/browser test automation in CI (PR videos are manual).

**Assessment: COMPLETE (unit/integration) / PARTIAL (no tenant-isolation or
E2E tests).**

---

## 15. Security Status

**Verified facts (present):**
- JWT httpOnly cookie auth, short-lived access + rotating refresh tokens,
  logout-all, token-theft revocation, "remember me."
- Role middleware; owner staff kill-switch (`User.isActive`); platform
  suspend (`Restaurant.isSuspended`).
- Rate limiting (incl. registration-specific), idempotency keys.
- **Webhook signature verification** for payment webhooks.
- **Encryption of provider credentials** (`COMMERCE_ENCRYPTION_KEY`, per PR #2).
- **Fraud signals** model + resolution; **admin audit log**.
- Security headers + CORS configured in `app.ts`.

**Verified facts (missing vs. blueprint §19):**
- **No RLS** — isolation is application-layer only (the blueprint's #1
  security requirement).
- **No MFA** for admin accounts (no TOTP/2FA anywhere).
- **Not Stripe-Connect PCI posture** as described (BYOP instead).
- No documented AI prompt-injection isolation boundary (AI runs in-process).

**Assessment: PARTIAL.** Solid conventional app security; **missing the
database-enforced tenant isolation and MFA** the blueprint treats as
non-negotiable.

---

## 16. Feature Classification Ledger

### Delivered (COMPLETE)
- Owner/staff auth (reset, verify, remember-me, logout-all), role model.
- Business Setup Wizard (`SetupStep` state machine) + resume-across-devices
  (`OnboardingStatus`).
- Menu catalog (categories/items/images), menu-commerce (modifiers, variants,
  inventory).
- Cart, guest + account checkout, tax/fee/quote engine, order state machine,
  order events/timeline, order numbering.
- Coupons, gift cards, loyalty (program/accounts/txns), reviews.
- QR ordering (tables + tokens).
- Delivery-rules engine (zones, fee rules, smart routing, kitchen capacity) —
  *rules/config are real even though the delivery-provider dispatch is stub*.
- Website Builder: generation, renderer, SEO/JSON-LD/sitemap, versioning,
  preview+approval, publishing, custom domains + TLS, site scoring,
  customization studio.
- Theme Engine V3 (business-type-aware selection, premium catalog entry).
- Menu import via **photo / PDF / CSV / website scrape / Google Maps**.
- Platform admin (restaurant management/suspend, audit log).
- Reliability: outbox, idempotency, job durability/reaper, rate limiting,
  fraud signals, webhook verification.
- Stripe payments (BYOP, real intents/refunds).
- Transactional email (SMTP).

### Partial (PARTIAL)
- Multi-tenancy (app-layer `restaurantId`, no RLS, no locations).
- AI (Layer 1 real, Layer 2 partial).
- Stripe (real but BYOP, not Connect).
- Google Business Profile import (via Google Maps adapter).
- Theme/brand generation (no bilingual, no AI image gen).
- Realtime (polling, not push).
- Object storage (S3/local, not Supabase Storage).

### Stub (STUB)
- Uber Direct, DoorDash Drive, local-courier delivery dispatch.
- SMS (Twilio) and Push notifications.
- POS providers (Clover, Square, Toast, Lightspeed, Generic).
- Non-Stripe payment providers (Adyen, Authorize.net, Clover, Fiserv, Square).
- DoorDash / UberEats / Grubhub **menu-import** adapters.

### Not Started (NOT STARTED)
- **Billing / subscriptions** (Starter/Growth/Pro/Enterprise plans, Stripe
  Billing) — no models, no routes; referral rewards blocked on this.
- **AI Business Consultant** (chat + `ai_insights` + proactive cron +
  one-click execute).
- **Marketing automation** (campaigns, automations: winback/birthday/review/
  welcome/referral, segments, TCPA opt-in ledger).
- **Bilingual (EN/AR) + RTL** (no `name_ar`, no i18n, no RTL).
- **Multi-location** (no `locations` table).
- **pgvector / semantic search / product embeddings.**
- **MFA** for admin.
- **Clover catalog/inventory import + sync.**

### Needs Verification
- Exact live/production deployment target (Render vs Railway — both
  configured; runtime env not observable from repo).
- Whether the remaining dark/zinc dashboard pages have been re-themed to the
  cream/gold system (PROJECT_MEMORY explicitly says it doesn't track this
  reliably).
- Actual passing test totals at HEAD (file counts verified; suite totals are
  PR-reported).

---

## 17. Open PR Analysis

**Verified via GitHub (`abukeeth/core`, open PRs):**

| PR | Title | State | Assessment |
|---|---|---|---|
| **#14** | Theme Engine V2 — real storefront imagery | Open, not merged | **Likely superseded.** V3 (#15–#17) merged to `main` *after* #14 opened. Its imagery/section work may be partly obsolete or need rebasing onto V3. Decide: close, or salvage the imagery layer onto V3. |
| **#8** | Phase 1 repository discovery audit (docs only) | Open, not merged | Documentation-only; overlaps this Source-of-Truth. Reconcile/supersede. |
| **#6** | Fix prod register/login "Request failed" (trailing-slash API_URL) | Open, **draft** | **Real production bug fix** with strong evidence. Should be reviewed/merged — it addresses a live auth-proxy 404. High value, low risk. |
| **#2** | Cursor Cloud dev environment (`AGENTS.md`) | Open, **draft** | Environment/setup only. Low risk; merge or close per tooling preference. |

**Program note:** Merged history shows a **rapid, sprint-tagged cadence**
(#9–#17 recently), meaning `main` moves fast and open PRs stale quickly.
PR #14 staling behind V3 is the concrete example.

---

## 18. Technical Debt

1. **Architectural substrate mismatch** — the biggest debt: the repo is built
   on Prisma/Express/Render, the blueprint on Supabase/RLS/Edge. Every future
   "blueprint-faithful" feature (RLS, Edge-scoped AI, Realtime) either forces
   a migration or an explicit, documented *decision to diverge*.
2. **Tenant table named `Restaurant`** with `ownerId @unique` — bakes in
   "one owner, one restaurant, one location," blocking multi-location and
   franchise (Enterprise phase) without a schema evolution.
3. **Dashboard layout duplication** — `dashboard-nav.tsx` vs.
   `dashboard-overview.tsx` maintain parallel nav implementations.
4. **Two website surfaces** — manual Website Hub (`/dashboard/website/*`) and
   AI Builder (`/dashboard/builder/*`) not yet consolidated (per ROADMAP).
5. **Stale memory docs** — `PROJECT_MEMORY.md` still says repo is
   `ordervora/Ordervora-MVP` and frames the product as restaurant-only;
   `RELEASE_NOTES.md` is the only trusted history and is ~211 KB.
6. **Provider stubs presented as integrations** — payments/POS/delivery
   registries list many vendors, but only Stripe + SMTP email are real; risk
   of overstating readiness.
7. **Polling for live data** — KDS/order screens poll; will not scale to the
   "live order pulse" UX the blueprint promises.

---

## 19. Architectural Risks

1. **RLS absence (critical).** Tenant isolation depends on every query being
   correctly scoped in code. A single missing `where: { restaurantId }` is a
   cross-tenant data leak — precisely the failure mode the blueprint's
   DB-enforced RLS was designed to make *architecturally impossible*.
2. **Substrate decision debt.** Not choosing explicitly between
   "migrate to Supabase" vs. "stay on Prisma/Postgres and add RLS +
   equivalents" will cause every phase to re-litigate the platform.
3. **Single-restaurant tenancy shape** blocks Enterprise/franchise and
   multi-location without invasive schema change.
4. **AI runs in-process, unscoped by an Edge boundary** — no structural
   guarantee against prompt-injection reaching other tenants' data; relies on
   application scoping.
5. **No billing substrate** — the entire revenue model is unbuilt, so pilots
   can't be monetized and referral rewards are inert.

---

## 20. Production Risks

1. **Monetization impossible today** — no subscription/plan/Stripe Billing.
2. **Delivery is a stub** — any storefront advertising delivery would fail at
   dispatch (Uber Direct / DoorDash Drive throw `NotImplemented`).
3. **SMS is a stub** — order SMS, marketing SMS, and TCPA opt-in/STOP
   compliance are all unbuilt; enabling SMS features would silently no-op.
4. **Cross-tenant leak risk** from app-layer-only isolation (see §19.1).
5. **No MFA** on admin accounts controlling all tenants.
6. **Live auth bug** (PR #6) — production register/login "Request failed"
   until that fix ships.
7. **Realtime by polling** — load and latency concerns at scale for KDS.

---

## 21. Verified Facts (consolidated)

- Stack: pnpm monorepo, Express+Prisma API, Next.js 15 web, PostgreSQL.
- Tenant = `Restaurant` (`ownerId @unique`); isolation via app-layer
  `restaurantId` scoping; **no RLS, no `tenant_id`, no `locations`**.
- `BusinessType` enum supports 9 industry types (multi-vertical foundation).
- 2,130-line Prisma schema, 17 migrations, CI-enforced migration policy.
- Commerce domain is deep and real (orders/checkout/cart/payments/coupons/
  loyalty/reviews/delivery-rules/qr/menu-commerce).
- Website builder + renderer + domains + scoring + Theme Engine V3 are real.
- AI provider abstraction (OpenAI default, Anthropic, Gemini); real menu
  vision extraction; partial brand/content generation.
- Stripe payments real (BYOP, not Connect); SMTP email real (transactional).
- **Stubs:** Uber Direct, DoorDash Drive, SMS (Twilio), Push, all POS
  providers, non-Stripe payment providers, DoorDash/UberEats/Grubhub import.
- **Not started:** billing/subscriptions, AI Consultant, marketing
  automation, bilingual/RTL, multi-location, pgvector, MFA, Clover import.
- 166 API + 43 web test files; CI runs against real Postgres; no RLS/E2E tests.
- Deploy: API on Render/Railway (Docker), web on Vercel; not Supabase/Edge.
- 4 open PRs (#14 superseded, #8 docs, #6 real prod fix draft, #2 env draft).

## 22. Unverified Areas

- Live production topology and env values (Render vs Railway active target).
- Actual current pass/fail of the full suite at HEAD (PR-reported only).
- Whether legacy dashboard pages are fully re-themed to cream/gold.
- Runtime behavior of Google Maps/GBP import against live Google APIs.
- Any Supabase usage in a deploy environment not represented in the repo.

---

*Companion documents: `BLUEPRINT_GAP_MATRIX.md`,
`PHASE_1_FOUNDATION_COMPLETION_PLAN.md`, `MASTER_EXECUTION_SEQUENCE.md`.*
