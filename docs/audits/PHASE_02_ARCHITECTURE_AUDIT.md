# Phase 2 — Architecture Audit

**Audit type:** Technical Due Diligence — Architecture Review
**Repository:** `abukeeth/core` (product: **OrderVora**; package `ordervora-mvp`)
**Date:** 2026-07-17
**Scope:** Architecture only. UI, database design, and security are explicitly **out of scope** for this phase and are deferred to later phases. Every finding below is supported by concrete repository evidence (`file:line` references).

**Baseline metrics (measured):**
- Backend (`apps/api/src`): **306 source files**, **160 test files**, **~23,089 LOC** (non-test).
- Data model: ~70+ Prisma models, 60+ enums (`apps/api/prisma/schema.prisma`, ~2,100 lines).
- Two deployable apps in one pnpm monorepo; `packages/*` declared but empty.

---

## Table of Contents
1. [Method & Evidence Base](#1-method--evidence-base)
2. [Area-by-Area Architecture Review](#2-area-by-area-architecture-review) (14 areas)
3. [Module Classification (KEEP / REFACTOR / REWRITE / REMOVE)](#3-module-classification)
4. [Top 10 Architectural Risks](#4-top-10-architectural-risks)
5. [Top 10 Architectural Strengths](#5-top-10-architectural-strengths)

---

## 1. Method & Evidence Base

Findings were derived by reading composition roots (`apps/api/src/index.ts`, `apps/api/src/app.ts`), module boundaries, the provider-registry implementations, background schedulers, the storage/renderer abstractions, and the frontend↔backend boundary (`apps/web/next.config.ts`, `apps/web/src/proxy.ts`). Cross-module coupling was measured with dependency grep across `src/modules`. Provider completeness was measured by the `readonly implemented` flags in each provider file.

---

## 2. Area-by-Area Architecture Review

### 2.1 Monorepo Design

**Current Architecture.**
A pnpm workspace (`pnpm-workspace.yaml`) declaring `apps/*` and `packages/*`. Only two apps exist (`apps/api`, `apps/web`); **no `packages/*` package is present**. Each app carries its own `src/lib` and its own types. TypeScript project config is rooted at `tsconfig.base.json`. Build/lint/typecheck/test are fanned out via `pnpm -r --if-present` from the root `package.json`.

**Strengths.**
- Single-repo, single-lockfile (`pnpm-lock.yaml`) keeps the API and web app version-locked together and atomically committable.
- Root scripts (`build`, `lint`, `typecheck`, `test`) give one uniform entry point across both apps.
- Clear two-tier split (backend service vs. web app) with no third ambiguous app.

**Weaknesses.**
- The `packages/*` glob is aspirational — there is **no shared package**. Types that logically span the boundary (API request/response shapes, enums) are not shared; the web app re-declares client-side contracts in `apps/web/src/lib/*-api.ts`. This is duplicated contract knowledge with no compiler-enforced link.
- Cross-app type safety relies on Prisma-generated types on the backend only; the frontend cannot import them.

**Risks.**
- Contract drift between `apps/api` responses and `apps/web` client wrappers is invisible to the type system; it surfaces only at runtime.

**Scalability Concerns.**
- Adding a third surface (e.g. a mobile BFF or an admin app) would immediately need shared contracts the monorepo is structured for but hasn't populated.

**Maintainability Concerns.**
- Low structural risk. The main cost is the manual duplication of DTO shapes across the boundary.

---

### 2.2 Domain Boundaries

**Current Architecture.**
Backend domains live under `apps/api/src/modules`: `auth`, `restaurants`, `menu`, `imports`, `sites`, `admin`, and a 16-submodule `commerce/*` engine. `restaurants` owns the tenant entity; `commerce/*` owns transactional commerce; `sites` owns website generation/publishing. Boundaries are expressed by directory and by the `controller/service/routes/validation/errors` file convention.

**Strengths.**
- Domains are recognizable and cohesive; each has a service layer as the unit of business logic.
- `restaurants` is a clear tenant-root domain that others depend on for scoping (`getOwnRestaurantId`).

**Weaknesses.**
- **Boundaries are directory conventions, not enforced contracts.** Cross-domain calls are direct service imports. Measured examples:
  - `sites/renderer/render-site.ts:4-7` imports `getTopItems` (commerce/analytics), `listActiveCoupons` (commerce/coupons), `getProgram` (commerce/loyalty), and `listCategories` (menu). The `sites` domain reaches directly into four other domains' services.
  - Every commerce submodule controller imports `getOwnRestaurantId` and `NoRestaurantError` from `restaurants` (`orders.controller.ts:4-5`, `payments.controller.ts:3-4`, `pos.controller.ts:3-4`, `coupons.controller.ts:2-3`, and ~10 more).
  - `menu-commerce.controller-helpers.ts:5` reaches into `sites/site.service.revalidatePublishedSite` — a commerce→sites dependency, the reverse direction of render-site's sites→commerce dependency, creating a **bidirectional coupling** between `commerce` and `sites`.

**Risks.**
- The `commerce ↔ sites` bidirectional dependency makes those two domains effectively one unit for the purposes of extraction or independent evolution.

**Scalability Concerns.**
- Domains cannot be split into independently deployable services without untangling these direct imports first.

**Maintainability Concerns.**
- A change to a commerce service signature can ripple into `sites` rendering and vice versa, with only tests (not module boundaries) as the guard.

---

### 2.3 Module Organization

**Current Architecture.**
Every module follows a strict, repeated file taxonomy: `*.controller.ts`, `*.service.ts`, `*.routes.ts`, `*.validation.ts`, `*.errors.ts`, plus co-located `*.test.ts`. Providers/adapters are isolated in `providers/` or `adapters/` subfolders behind a `registry.ts`.

**Strengths.**
- **Exceptional internal consistency.** A developer who learns one module can navigate all of them. Errors are domain-typed (`*.errors.ts`), validation is centralized per module (`*.validation.ts`, Zod), and controllers stay thin.
- Test co-location is disciplined — 160 test files against 306 source files.

**Weaknesses.**
- The controller layer carries cross-cutting boilerplate (error `instanceof` mapping appears in 23 controllers) rather than a shared error-to-HTTP mapper. This is repetition, not a defect.
- Some modules are very large (`sites` has ~40 non-test files spanning generation, rendering, domains, scoring, SEO) — it is really several sub-domains under one folder.

**Risks / Scalability / Maintainability.**
- Low risk. The taxonomy is a durable strength. The main maintainability note is the repeated error-mapping boilerplate and the `sites` module's internal breadth.

---

### 2.4 Frontend Architecture

**Current Architecture.**
Next.js 16 App Router (`apps/web`). The browser talks only to the Next app; `next.config.ts:31-43` rewrites `/api/*`, `/preview/*`, `/assets/*`, and `/store/*` server-side to the backend (`apiUrl` from build-time `API_URL`). Auth gating is a lightweight edge check (`src/proxy.ts`) matching `/dashboard/:path*` that redirects to `/login` when the `access_token` cookie is absent. API access is split into audience-specific client wrappers (`commerce-api.ts`, `owner-commerce-api.ts`, `staff-commerce-api.ts`, `server-api.ts`).

**Strengths (architecture only).**
- **Same-origin proxy** is a clean architectural decision: the browser never makes cross-origin calls, which simplifies CORS and cookie handling (documented in `app.ts:176-181`).
- Clear separation of server-side vs. client-side API layers.

**Weaknesses.**
- `API_URL` is baked at **build time** (`next.config.ts:4-12`), not runtime. The same built image cannot be repointed at a different backend without rebuilding — an operational coupling between build and environment.
- The edge auth check only tests **cookie presence**, not validity — real authorization is entirely deferred to the backend (acceptable architecturally, but the frontend gate is cosmetic).

**Risks / Scalability / Maintainability.**
- Build-time API binding complicates promote-the-same-artifact deployment flows. Otherwise the frontend architecture is straightforward. (UI itself is out of scope per instructions.)

---

### 2.5 Backend Architecture

**Current Architecture.**
Express 5 app assembled by a single `createApp()` factory (`app.ts:143-331`). Middleware order is deliberate and documented: request-correlation (AsyncLocalStorage) → metrics → helmet → CORS → JSON body (with raw-body capture for webhooks) → cookies → asset route → health/ready/metrics → site-edge middleware → routers. `index.ts` owns process lifecycle: fail-fast env validation, object-storage assertion, graceful SIGTERM/SIGINT shutdown, and starts four background timers.

**Strengths.**
- **Composition root is clean and explicit.** `createApp()` is pure app assembly; `index.ts` owns process concerns (listen, workers, shutdown). Tests build the app without starting timers (`outbox-scheduler.ts:17-19` explicitly warns never to import schedulers from `app.ts`).
- Production-hardening depth is real: correlation IDs, Prometheus metrics, `/health` (with per-worker health snapshot), `/ready` (DB probe), graceful drain with a 10s force-exit fallback (`index.ts:120-123`), and process-level `uncaughtException`/`unhandledRejection` handlers that crash-and-restart rather than continue with corrupt state (`index.ts:26-36`).
- Service layer is the consistent home of business logic; controllers are thin.

**Weaknesses.**
- Everything runs in **one process**: HTTP serving and all four background workers share the API process (`index.ts:65-74`). There is no separate worker deployment.
- Route mounting overloads `/api/restaurants` with ~12 routers (`app.ts:284-294`); path ownership is spread across many router files, so the URL surface is only discoverable by reading all of them.

**Risks / Scalability / Maintainability.**
- See §2.11 (Background Jobs) — the single-process model is the dominant backend scalability constraint.

---

### 2.6 Service Boundaries

**Current Architecture.**
Services are plain modules exporting functions; they are invoked directly by controllers and by other modules' services (no interface indirection between domains, except where a registry/adapter seam exists). The seams that *do* exist are explicit: `FileStorage`, `ReleaseStorage`, `ImportJobRunner`, `AIProvider`, and the four provider registries.

**Strengths.**
- Where a boundary was expected to change (storage backend, AI vendor, payment vendor, job queue), a **named interface seam** was deliberately introduced — e.g. `ImportJobRunner` (`imports/job-runner.ts:8-11`) explicitly documents itself as "the seam for swapping in a real queue (BullMQ/SQS) later without touching the controller or service."

**Weaknesses.**
- Between *domains*, there is no seam — `sites` calls commerce/menu services directly (§2.2). The seam discipline applied to *infrastructure* was not applied to *domain* boundaries.

**Risks.**
- Domain-to-domain refactors are unshielded; infrastructure swaps are well shielded. This is an asymmetric boundary strategy.

---

### 2.7 API Design

**Current Architecture.**
REST over Express, cookie-authenticated. Namespaced surfaces: `/api/auth`, `/api/restaurants/*` (owner/staff), `/api/admin/*`, `/api/menu`, `/api/imports`, `/api/sites`, `/api/public/*` (guest/customer), `/api/customer/*` (end-diner accounts), `/api/webhooks/payments` (signature-verified, no auth). Validation is Zod per module; errors are domain-typed and mapped to HTTP in controllers.

**Strengths.**
- **Audience segmentation is explicit at the URL level** — owner vs. public vs. customer vs. admin vs. webhook surfaces are distinct route trees with distinct auth strategies (`app.ts:283-318`). This is a strong, legible API topology.
- Idempotency is a first-class concern: a `require-idempotency-key` middleware and an `IdempotencyKey` model exist.
- Webhooks correctly capture raw request bytes before JSON parsing for signature verification (`app.ts:193-199`).

**Weaknesses.**
- Error-to-HTTP mapping is duplicated across 23 controllers rather than centralized in one error-handling middleware (the top-level handler only covers Multer + 500s, `app.ts:320-328`).
- No API versioning (`/api/v1`) — a breaking change has no coexistence path.
- No machine-readable API spec (OpenAPI) was found; the contract lives only in code + the web client wrappers.

**Risks / Scalability / Maintainability.**
- Absence of versioning + absence of a shared contract package (§2.1) means breaking changes are coordinated by convention, not tooling.

---

### 2.8 Multi-Tenancy Architecture

**Current Architecture.**
Tenancy is **row-scoped by `restaurantId`, enforced manually in application code**. The pattern is uniform: a controller resolves the caller's tenant via `getOwnRestaurantId(userId)` (`restaurants/restaurant.service.ts:42-45`, a single lookup of `user.restaurantId`), then passes that id into the service, which filters every Prisma query by it. **36 of 43 service files** reference `restaurantId`. There is no tenant-injecting middleware and no database-level row isolation (RLS is out of scope this phase; the architectural point is that isolation is purely application-layer).

**Strengths.**
- The pattern is **applied consistently** — the same `getOwnRestaurantId` + `NoRestaurantError` idiom appears across every commerce controller (measured in §2.2), so there is one well-known way to scope a request.
- Owner identity → single restaurant is a simple, comprehensible tenancy model (`User.restaurantId`).

**Weaknesses.**
- **Isolation is only as strong as each query's `where` clause.** Nothing structurally prevents a new service method from forgetting the `restaurantId` filter; there is no compile-time or DB-level backstop. Correctness depends on 36 files each doing the right thing every time.
- The model assumes **one restaurant per owner** (`createRestaurant` rejects a second, `restaurant.service.ts:47-51`). Multi-location (an explicit roadmap goal) does not fit this shape without rework.

**Risks.**
- A single missing filter in a future query is a cross-tenant data exposure. The architecture provides no defense-in-depth for that class of mistake.

**Scalability Concerns.**
- One-owner-one-restaurant blocks multi-location/franchise tenancy without a schema and scoping-model change.

**Maintainability Concerns.**
- Every new query is a place tenancy can regress; reviewers must know to check for it.

---

### 2.9 Commerce Engine Architecture

**Current Architecture.**
The largest domain (`commerce/*`, 16 submodules). Order lifecycle is modeled as an explicit **state machine** (`orders/order-state-machine.ts`) with an **event outbox** (`events/outbox-worker.ts`, `record-order-event.ts`) for reliable side-effects. Payments use a **provider registry + orchestrator** with transparent failover: `authorizeOrderPayment` (`payments/orchestrator.ts:44+`) looks up the method's primary provider, and if it is not `CONNECTED`, builds a fallback list of every other CONNECTED provider ordered by priority and tries each, writing one `PaymentAttempt` per try. Delivery has geometry-based zones, fee rules, hours, and kitchen capacity. Concurrency-sensitive paths have dedicated integration tests (`order-number.concurrency.integration.test.ts`, `outbox-worker.concurrency.integration.test.ts`, `expire-stale-offers.concurrency.integration.test.ts`).

**Strengths.**
- **This is the architectural core and it is seriously built.** Explicit state machine, transactional outbox for eventing, idempotency, and provider-transparent payment failover (`orchestrator.ts:34-43`) are patterns associated with mature commerce systems.
- Concurrency correctness is treated as a first-class concern with dedicated integration tests.
- The payment adapter contract cleanly isolates vendor SDKs — "nothing outside payments/providers/*.ts references a specific provider's SDK" (`registry.ts` doc comment).

**Weaknesses.**
- **Only 1 of 6 payment providers is implemented.** Stripe is `implemented = true` (`stripe.provider.ts:37`); Square, Adyen, Authorize.Net, Clover, Fiserv are all `implemented = false` stubs. **All POS providers** (Toast, Square, Clover, Lightspeed, generic) are `implemented = false`. **All fulfillment providers** (DoorDash Drive, Uber Direct, local courier) are `implemented = false`. The registry/failover architecture is real but currently routes to a single live provider.
- The outbox and all schedulers are in-process (§2.11).

**Risks.**
- The sophisticated failover orchestration has **no second live provider to fail over to** today, so the failover path is largely untested against real vendors.

**Scalability Concerns.**
- Outbox draining is single-process polling (`outbox-scheduler.ts`), a throughput ceiling under high order volume.

**Maintainability Concerns.**
- Low — the engine is well-factored. The gap is *implementation completeness*, not structure.

---

### 2.10 Website Builder Architecture

**Current Architecture.**
Two coexisting flows: an AI "Builder" (`dashboard/builder`) and a manual "Website Hub" (`dashboard/website`), backed by the `sites` module. Generation pipeline: brand analysis → theme catalog/matching → content generation → section rules → assembly → render. Rendering is a **deterministic static-generation** pipeline (`sites/renderer/*`) that writes HTML once to `ReleaseStorage` (`release-storage.ts`), keyed by `siteId/versionId/slug`; production serving reads the static file rather than re-rendering. Published sites are served by Host-header edge middleware (`siteEdgeMiddleware`) with a `/store/<slug>` path fallback for pre-wildcard-DNS operation (`app.ts:270-282`). Custom domains have verification + an SSL issuance scheduler.

**Strengths.**
- **Determinism as a design invariant** — "same definition + theme version → identical output" (`app.ts:158-164`), enabling publish-once/serve-static. This is a clean separation of generation from serving.
- Versioned releases (`SiteVersion`) give an immutable publish artifact.
- The renderer is split into small, individually tested units (html-escape, json-ld, seo-head, layout-engine, theme-css, og-image, sitemap — each with a `.test.ts`).

**Weaknesses.**
- The renderer **reaches directly into four other domains** (`render-site.ts:4-7`) — commerce analytics, coupons, loyalty, and menu. Website rendering is coupled to commerce internals.
- **Two parallel website flows** (`/dashboard/website/*` and `/dashboard/builder/*`) whose consolidation is still an open product decision (per `ROADMAP.md`). Architecturally this is duplicated surface for one capability.
- `ReleaseStorage` defaults to local disk (ephemeral in a container); durability depends on S3 being configured.

**Risks.**
- Coupling to commerce means a commerce refactor can break public site rendering.
- Two flows risk divergent behavior for the same publish operation.

**Scalability / Maintainability Concerns.**
- Static-serving scales well (files/CDN). The maintainability concern is the two-flow duplication and the cross-domain render coupling.

---

### 2.11 AI Architecture

**Current Architecture.**
A single provider-selection seam, `getAIProvider()` (`lib/ai/index.ts:20-26`), returns an `AIProvider` implementation chosen by first-configured key: OpenAI → Anthropic → Gemini. Re-evaluated per call (not memoized), matching the lazy-env pattern. Every AI feature (menu vision extraction, brand analysis, content generation, brand-consistency scoring) routes through this one function; no feature instantiates a vendor SDK directly.

**Strengths.**
- **Textbook adapter/strategy pattern.** Swapping AI vendors is an env change, never a code change (`lib/ai/index.ts:8-19`). Three vendors are behind one `AIProvider` interface with per-provider tests.
- The seam is honored — AI vendor SDKs (`openai`, `@anthropic-ai/sdk`, `@google/generative-ai`) appear only under `lib/ai/providers`.

**Weaknesses.**
- Provider **selection is implicit and global** (first key wins), so per-feature model choice (e.g. a cheaper model for scoring, a vision model for import) isn't expressible through this seam without extension.
- No visible cost/rate-limit/retry governance at the seam (retry/backoff, token budgeting) — those concerns, if present, live inside each provider.

**Risks.**
- A single global provider means one vendor outage disables *all* AI features at once; there is no per-feature fallback.

**Scalability / Maintainability Concerns.**
- The abstraction is clean and low-maintenance. The main limitation is expressiveness (one global provider, no per-call model routing).

---

### 2.12 Background Jobs

**Current Architecture.**
Four in-process schedulers started in `index.ts:69-74`: `startStaleOfferScheduler`, `startOutboxWorker`, `startSslIssuanceScheduler`, `startJobReaper`. Each is a `setInterval` poll in the API process (`outbox-scheduler.ts:29-46`). Import/generation jobs run in-process via `waitUntil(this.run(...))` (`imports/job-runner.ts:26-28`) rather than an external queue. **Job durability** was added: atomic claim via `updateMany` on a status transition, heartbeat, and a reaper that recovers jobs stranded by a dead process (`job-runner.ts:39-49`, `lib/job-reaper.ts`). Workers report health to `/health` via `lib/worker-health.ts`.

**Strengths.**
- **Durability without a broker** — atomic claim (`updateMany` where `status = PENDING` → `PROCESSING`, count-checked) makes enqueue idempotent and reaper-safe (`job-runner.ts:39-49`); heartbeat + reaper recover crashed jobs.
- Workers are **observable** (`/health` worker snapshot, per-poll metrics) rather than silent.
- Schedulers are deliberately kept out of `app.ts` so tests don't spawn timers.

**Weaknesses.**
- **Explicitly single-process.** `outbox-scheduler.ts:12-19` states: "Sufficient for this codebase's current single-process deployment model; see the H-11 remediation note on multi-instance claim coordination once horizontal scaling is introduced." Running two API instances would run every poller twice with no cross-instance coordination for the outbox/stale-offer/SSL loops (the import/generation jobs *do* have claim coordination; the periodic pollers do not).
- Job execution shares CPU/memory with HTTP serving — a heavy import (PDF/image AI extraction) competes with request handling in the same process.

**Risks.**
- Horizontal scaling of the API is **blocked** until the periodic pollers gain claim coordination or move to a dedicated single-runner worker deployment. This is the single most consequential architectural constraint.

**Scalability Concerns.**
- Throughput of eventing (outbox) and imports is bounded by one process's poll loop.

**Maintainability Concerns.**
- The DB-as-queue approach is simple and dependency-light; the cost is that scaling requires re-architecting the run model, not just adding instances.

---

### 2.13 Storage Architecture

**Current Architecture.**
Two parallel storage abstractions, both interface-first with local-disk and S3 implementations:
- `FileStorage` (`lib/file-storage.ts:8-11`) for uploads (menu PDFs/photos, site assets) — random-UUID keys.
- `ReleaseStorage` (`lib/release-storage.ts:6-13`) for published site pages/assets — deterministic `siteId/versionId/slug` keys.
Backend selection is env-driven (`OBJECT_STORAGE_*`). Asset serving has three explicit modes (local static, direct-from-CDN, or API-proxied) chosen by config (`app.ts:119-141`). Production boot refuses to start if object storage is unconfigured (`index.ts:56`, `assertProductionObjectStorageConfigured`).

**Strengths.**
- **Clean interface seam** — callers depend only on `FileStorage`/`ReleaseStorage`, never on S3 SDK types; the returned `path` is treated as an opaque key (`file-storage.ts:12-16`, `43-49`).
- The three-mode asset strategy is thoughtfully documented and covers private-bucket, CDN, and local-dev cases (`app.ts:101-141`).
- Fail-fast in production prevents the classic "uploads silently written to ephemeral container disk" failure (`index.ts:49-56`).

**Weaknesses.**
- Two separate storage abstractions with overlapping S3 mechanics (`file-storage.ts` and `release-storage.ts` both instantiate S3 clients via `object-storage-client.ts`) — some duplication of the S3 read/write plumbing.
- Defaults are local disk; correctness in production depends entirely on env configuration being right.

**Risks / Scalability / Maintainability.**
- Low architectural risk. Storage is one of the better-abstracted areas. Minor duplication between the two storage classes.

---

### 2.14 Integration Architecture

**Current Architecture.**
All external integrations sit behind **registry + adapter** seams: payments (`payments/registry.ts`), POS (`pos/registry.ts`), fulfillment (`fulfillment/registry.ts`), notifications (`notifications/registry.ts`), import sources (`imports/adapters/registry.ts`), and AI (`lib/ai`). Each adapter declares `readonly implemented: boolean`, so the registry can distinguish live vs. placeholder providers at runtime. Infrastructure integrations: PostgreSQL (Prisma, provider-agnostic `DATABASE_URL`), Redis (`ioredis`, optional accelerator for rate-limiting), Sentry (error tracking), Prometheus (`prom-client`).

**Strengths.**
- **Uniform integration idiom across five different integration categories** — the same registry/adapter/`implemented` pattern is reused for payments, POS, fulfillment, notifications, and imports. This is a strong, repeatable extension model: adding a vendor is "one adapter class + one `.register()` line" (`payments/registry.ts` doc comment).
- The `implemented` flag makes the stub-vs-live boundary explicit and machine-checkable rather than hidden.
- Redis is architecturally optional (`index.ts:104-111`) — the system degrades rather than hard-depends.

**Weaknesses.**
- **Most adapters are stubs today** (measured): payments 1/6 live (Stripe), POS 0/5 live, fulfillment 0/3 live, notifications 1/3 live (email only; SMS and push are `implemented = false`). The *architecture* for many integrations exists; the *integrations* mostly do not.

**Risks.**
- The breadth of declared-but-unimplemented integrations can be mistaken for delivered capability. Failover, POS sync, delivery dispatch, and SMS/push notification flows have no live provider behind them.

**Scalability / Maintainability Concerns.**
- The pattern scales well to more vendors. The open work is implementation, not design.

---

## 3. Module Classification

Classification is **architectural** — it reflects structural fitness and boundary health, **not** implementation completeness (a well-architected stub is still KEEP) and **not** UI/DB/security concerns (out of scope this phase).

| Module / Area | Verdict | Rationale (evidence) |
|---|---|---|
| `apps/api` composition (`app.ts`, `index.ts`) | **KEEP** | Clean composition root, deliberate middleware order, graceful lifecycle, fail-fast boot. |
| `auth` | **KEEP** | Standard controller/service/routes taxonomy; cookie/JWT seam isolated. |
| `restaurants` (tenant root) | **REFACTOR** | Sound as a domain, but `getOwnRestaurantId` encodes one-owner-one-restaurant (`restaurant.service.ts:47-51`), which blocks the roadmap's multi-location goal. Tenancy resolution should become a seam that can return multiple scopes. |
| `menu` | **KEEP** | Cohesive, well-tested. |
| `commerce/orders`, `payments`, `checkout`, `cart` | **KEEP** | State machine, orchestrator, outbox, concurrency tests — architecturally mature core. |
| `commerce/events` (outbox) | **REFACTOR** | Design is right; the in-process single-runner poller needs multi-instance claim coordination before horizontal scaling (`outbox-scheduler.ts:12-19`). |
| `commerce/fulfillment`, `pos` | **KEEP (architecture) / stub-complete needed** | Registry/adapter structure is sound; providers are `implemented = false`. Keep the seams; the work is implementation, not redesign. |
| `commerce/*` provider registries (payments/pos/fulfillment/notifications) | **KEEP** | Best-in-repo extension pattern; keep as the integration template. |
| `imports` (+ adapters, job-runner) | **REFACTOR** | Adapter registry is excellent; `InProcessImportJobRunner` (`job-runner.ts`) is an acknowledged temporary seam ("swap in a real queue later") that should move to a dedicated worker before scale. |
| `sites` (generation) | **REFACTOR** | Strong renderer determinism, but the module is really several sub-domains in one folder and `render-site.ts:4-7` couples rendering to four other domains. Split generation vs. rendering vs. domains; introduce a read-model seam for the commerce data it needs. |
| `sites` (renderer/release) | **KEEP** | Deterministic static-generation + versioned releases is a clean, keepable design. |
| Website flow duplication (`dashboard/website` vs `dashboard/builder` + their `sites` backing) | **REFACTOR** | Two flows for one capability; consolidate per the open roadmap decision. |
| `admin` (audit log) | **KEEP** | Small, cohesive. |
| `lib/ai` | **KEEP** | Clean provider abstraction; extend for per-feature model routing rather than replace. |
| `lib/file-storage` + `lib/release-storage` | **REFACTOR** | Both are good abstractions but duplicate S3 plumbing; unify the S3 mechanics under `object-storage-client` and keep the two interfaces. |
| Background schedulers (stale-offer, outbox, ssl, reaper) as in-process timers | **REFACTOR** | Correct logic, wrong run-location for horizontal scale; extract to a dedicated worker process/deployment with cross-instance coordination. |
| `apps/web` proxy/client-layer architecture | **KEEP** | Same-origin proxy + audience-split clients is sound (UI itself out of scope). |
| Root `packages/*` (empty) | **REFACTOR** | Populate with a shared contracts/types package to remove API↔web DTO duplication. |
| Any module | **REMOVE** | **None.** No module was found to be dead, redundant-to-the-point-of-deletion, or architecturally superseded. The stubs are placeholders for planned work, not removable cruft. |

**Summary:** predominantly **KEEP** with targeted **REFACTOR** on (1) tenancy resolution, (2) the background-job run model, (3) the `sites` module's internal split and cross-domain coupling, (4) storage plumbing dedup, and (5) populating the shared-contracts package. **No REWRITE** and **no REMOVE** are warranted on architectural grounds.

---

## 4. Top 10 Architectural Risks

1. **Single-process background execution blocks horizontal scaling.** Outbox, stale-offer, SSL, and reaper are in-process `setInterval` pollers with no multi-instance coordination for the periodic loops; running two API instances double-runs them (`index.ts:69-74`, `outbox-scheduler.ts:12-19`). *Highest-impact constraint.*
2. **Application-only tenant isolation with no structural backstop.** Cross-tenant safety depends on every one of 36 service files including a `restaurantId` filter; one omission is a data-exposure bug and nothing (middleware, DB, types) prevents it (`restaurant.service.ts:42-45`).
3. **Integration breadth is mostly stubs.** Payments 1/6, POS 0/5, fulfillment 0/3, notifications 1/3 are `implemented = true`; failover, POS sync, delivery dispatch, and SMS/push have no live provider (measured across `*/providers/*.ts`).
4. **`commerce ↔ sites` bidirectional coupling.** `sites` renders from commerce services (`render-site.ts:4-7`) while commerce revalidates sites (`menu-commerce.controller-helpers.ts:5`); the two domains cannot evolve or deploy independently.
5. **Import/generation jobs run in the request process.** Heavy AI extraction competes with HTTP serving for CPU/memory (`imports/job-runner.ts`); a spike in imports degrades API latency.
6. **One-owner-one-restaurant tenancy model** contradicts the stated multi-location roadmap and would require scoping + schema rework to support (`restaurant.service.ts:47-51`).
7. **No shared contract between API and web.** DTO shapes are duplicated in `apps/web/src/lib/*-api.ts`; drift is invisible to the compiler (empty `packages/*`).
8. **Build-time backend binding on the frontend.** `API_URL` is fixed at `next build` (`next.config.ts:4-12`); the artifact can't be repromoted across environments without rebuild.
9. **Single global AI provider.** One vendor outage disables all AI features simultaneously; no per-feature fallback or per-call model routing (`lib/ai/index.ts:20-26`).
10. **Two parallel website flows** for one publish capability (`dashboard/website` vs `dashboard/builder`) risk behavioral divergence and duplicated maintenance (open per `ROADMAP.md`).

---

## 5. Top 10 Architectural Strengths

1. **Provider/adapter registry pattern reused uniformly across five integration categories** (payments, POS, fulfillment, notifications, imports) plus AI — one legible, low-cost extension model with an explicit `implemented` live/stub flag.
2. **Mature commerce core:** explicit order state machine, transactional **outbox** eventing, idempotency keys, and **transparent multi-provider payment failover** (`orchestrator.ts:34-43`) — patterns from serious commerce systems.
3. **Deterministic static-generation website engine:** "same input → identical output," publish-once/serve-static with versioned releases (`app.ts:158-164`, `release-storage.ts`) — clean generation/serving separation.
4. **Clean infrastructure seams:** `FileStorage`, `ReleaseStorage`, `ImportJobRunner`, and `AIProvider` are all interface-first with local/prod implementations, so vendor/backend swaps are config changes, not code changes.
5. **Disciplined, uniform module taxonomy** (`controller/service/routes/validation/errors` + co-located tests) across 306 files — exceptional navigability and consistency.
6. **Serious production-hardening architecture:** correlation IDs (AsyncLocalStorage), Prometheus metrics, `/health` with per-worker snapshots, `/ready` DB probe, graceful drain with force-exit fallback, crash-on-corrupt-state handlers (`index.ts`, `app.ts`).
7. **Job durability without a broker:** atomic DB claim + heartbeat + reaper makes in-process jobs crash-recoverable and enqueue idempotent (`job-runner.ts:39-49`).
8. **Clear API audience segmentation** at the URL level — owner, public, customer, admin, and signature-verified webhook surfaces are distinct route trees with distinct auth (`app.ts:283-318`).
9. **Clean composition root / lifecycle separation:** `createApp()` is pure assembly; `index.ts` owns process concerns; schedulers are deliberately excluded from the app factory so tests don't spawn timers.
10. **Same-origin proxy frontend architecture** (`next.config.ts:31-43`) eliminates cross-origin complexity and keeps a single cookie/CORS story; audience-split API clients keep the boundary organized.

---

*End of Phase 2 — Architecture Audit. Findings are architectural only; UI, database design, and security are addressed in later phases. This document does not prescribe remediation sequencing — that is deferred to a later remediation-planning phase.*
