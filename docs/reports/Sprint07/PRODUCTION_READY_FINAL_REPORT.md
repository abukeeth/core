# Ordervora — Production Readiness Final Report

**Scope:** Sprint 07 (Commerce & Fulfillment Engine) through Production Hardening Phase 11 (Scaling Strategy & Load Validation) — the complete 11-phase `PRODUCTION_HARDENING_MASTER_SPEC.md` plan, executed sequentially with explicit approval gates between each phase.

**Branch:** `claude/sprint-07-commerce-engine` (PR #3, not yet merged — awaiting review).

---

## 1. What was implemented, Phase 1 through Phase 11

### Foundation (Sprints 01–07, pre-dating this hardening effort)

Auth (staff + customer, JWT-based with refresh-token rotation), multi-tenant restaurant/menu management, an extensible Import Engine (PDF/Image real, Website/Google Maps real, DoorDash/Uber Eats/Grubhub stubs), an AI Website Builder with a static-site renderer and CDN-ready release pipeline, and the full Sprint 07 commerce engine: BYOP payments (Stripe real + 5 stubbed providers, multi-provider failover), checkout/order state machine, fulfillment (pickup + own-driver real, 3 courier stubs), delivery-rules/Smart Routing Engine, coupons, QR ordering, POS stubs, and notifications (real email, stubbed SMS/push). Sprints 07.6 (15/15 Critical) and 07.7 (13/13 High) closed every security/correctness finding from an internal audit. Sprint 07.8 cataloged the remaining production-readiness gap as backlog items PR-1 through PR-12.

### Phase 1 — Database Migrations & Production PostgreSQL
First real `prisma/migrations/` directory, generated and verified against a local PostgreSQL 16 instance (additive-only, zero drops, confirmed via `prisma migrate diff --exit-code`). `docs/runbooks/database-setup.md`, `migration-rollback.md`. **Closes PR-1** (partial — provider selection/PITR/connection pooling flagged for Phase 10/11).

### Phase 2 — CI/CD Hardening
CI (`ci.yml`) now runs the full test suite against a real Postgres service container; a "migration exists" check; a CD workflow scaffold. **Closes PR-2**; contributes to PR-3.

### Phase 3 — Secrets Management
`config/env.ts` centralizes what were 5 duplicated env-reading helpers; strict aggregated startup validation (`assertStartupEnv`); versioned envelope-encryption key rotation; dev/staging/production separation. `docs/runbooks/environment-configuration.md`, `secret-rotation.md`.

### Phase 4 — Deployment Architecture & Containerization
Multi-stage Dockerfiles for `apps/api` (4-stage: fetch/build/prod-deps/runtime) and `apps/web` (Next.js standalone output); `docker-compose.yml` for local production simulation; `/ready` readiness endpoint distinct from `/health`; graceful shutdown (`SIGTERM`/`SIGINT` draining in-flight requests before exit); `helmet` security headers (CSP, etc.); non-root/read-only/pinned-version immutable containers. `docs/runbooks/deployment-architecture.md`. **Closes PR-3, PR-8.**

### Phase 5 — Redis Introduction
Shared, multi-instance-safe Redis-backed store (`RedisRateLimitStore`, hand-written for an explicit fail-open contract) for every rate limiter, replacing the in-memory default. `docker-compose.yml` gains a `redis` service. Caching (PR-11) deliberately deferred — flagged Medium risk (invalidation correctness) versus the rate-limiter fix's Low risk, per the master spec's own explicit deferral option. `docs/runbooks/redis.md`. **Closes PR-4.**

### Phase 6 — Background Worker Hardening
`SELECT ... FOR UPDATE SKIP LOCKED` claiming makes the outbox worker and stale-offer sweep safe on more than one instance simultaneously — the single-instance gap Sprint 07.6/07.7 (C-11/H-11) explicitly flagged as future work. Verified with real concurrent-instance integration tests against a live Postgres.

### Phase 7 — Object Storage Migration
`S3FileStorage`/`S3ReleaseStorage` alongside the existing local-disk implementations, selected by an env-driven factory (`OBJECT_STORAGE_BUCKET`) — zero caller changes, local development unaffected by default. Provider-agnostic (AWS S3, Cloudflare R2, Backblaze B2, MinIO) via `@aws-sdk/client-s3`. Explicit three-way public-asset serving strategy (local disk / direct-CDN / API-proxied); MinIO added to `docker-compose.yml`; a reusable migration script. `docs/runbooks/object-storage.md`.

### Phase 8 — Image Optimization
`sharp`-based resizing generating thumbnail/card/full WebP variants at upload time, replacing "one full-resolution file reused everywhere." Wired into `asset.service.ts`'s `uploadAsset` (fail-open: a resize failure never blocks the upload) and the renderer's `resolveRenderAssets`. Import adapters and `apps/web` audited — found no relevant call site (imports never persist images; no `apps/web` component consumes `SiteAsset` yet) and documented honestly rather than forced.

### Phase 9 — Monitoring & Logging
Every `console.*` call site across `apps/api/src` migrated to structured `pino` logging; request-correlation middleware via `AsyncLocalStorage`; swappable error tracking (`lib/error-tracker.ts`, Sentry-optional, no-op by default) wired into every `bestEffort()`-swallowed failure, the event bus, the outbox worker, both schedulers, the top-level Express error handler, and new process-level `uncaughtException`/`unhandledRejection` handlers; Prometheus-style `/metrics` (request latency/count, background-job batch size/duration, payment-provider success/failure rate); `/health` extended with each background worker's last-successful-poll timestamp. `docs/runbooks/monitoring-logging.md`. **Closes PR-9.**

### Phase 10 — Backups & Disaster Recovery
`scripts/restore-drill.sh` — **actually executed twice** against a real local PostgreSQL instance (dump → throwaway database → restore → boot the compiled server → verify data integrity → teardown), both runs passed, full cycle under 15 seconds. `docs/runbooks/disaster-recovery.md`: access list, RTO/RPO targets, the drill's captured output, a quarterly re-run recommendation, a restore-in-progress communication plan.

### Phase 11 — Scaling Strategy & Load Validation
`load-tests/**` drives real HTTP load at the checkout hot path via `autocannon` against a throwaway database and the compiled server. Three scenarios executed: ~10-restaurant and ~100-restaurant single-instance runs (both ~60-67 req/sec aggregate throughput), and a genuine 2-instance horizontal scale-out run confirming Phase 5's shared rate limiting and Phase 6's outbox worker both behave correctly under real multi-process concurrency. **Empirically identified the first real bottleneck** — not the Serializable/coupon contention the master spec predicted, but two find-then-create race conditions (§2 below). Measured Postgres connection-pool sizing (~10/instance, confirmed to multiply linearly with instance count — informs but does not itself close PR-10's pooling question). Made every rate-limit threshold env-configurable. `docs/reports/ProductionHardening/LOAD_TEST_RESULTS.md`. **Closes PR-10** (empirical answer, not a deployed pooler).

### Verification, every phase
Every phase ran `prisma validate`, `prisma generate`, `pnpm run lint`, `pnpm run typecheck`, the full test suite, and `pnpm run build` before being considered complete. Current state: **921/921 unit/integration tests passing + 2 real-database integration tests correctly skipped by default** (independently verified passing against a live Postgres in Phase 6's own verification), **9/9 `apps/web` tests passing**, production build clean for both apps (28 `apps/web` routes compiled).

---

## 2. Remaining known limitations

### Newly discovered by Phase 11's load testing (not yet remediated)

1. **`nextOrderNumber()` race** (`modules/commerce/orders/order-number.ts`) — read-max-then-insert races under concurrent same-restaurant checkouts at `READ COMMITTED` isolation (only the coupon path elevates to `Serializable`). The function's own comment already flagged the theoretical risk; this is now empirically confirmed as the dominant failure mode under load.
2. **Lazy-singleton-config race**, duplicated in two places — `delivery-config.service.ts::getConfig()` and `kitchen-capacity.service.ts::getCapacity()`, both find-then-create a restaurant's settings row with no conflict handling; concurrent first-ever requests for a brand-new restaurant can race.

Both are documented in `LOAD_TEST_RESULTS.md` as findings for a **future remediation sprint** — not fixed as part of Phase 11 per explicit instruction not to modify unrelated application business logic. **These should be prioritized before onboarding any restaurant expected to receive concurrent same-restaurant order volume** (a busy lunch rush is exactly the condition that triggers them).

### Carried forward from Sprint 07.6/07.7 (never in Production Hardening's scope)

- **19 Medium and 10 Low findings** remain open, tracked in `SPRINT_07_6_REMEDIATION_PLAN.md`, not yet scheduled.

### Backlog items Production Hardening's 11 phases deliberately did not address

Per the master spec's own phase-to-PR mapping (only PR-1, 2, 3, 4, 8, 9, 10 map to a phase):

- **PR-5** — SMS and push notification channels are stubs; every driver-dispatch SMS and any push notification is silently a no-op today.
- **PR-6** — Only 1 of 6 registered payment providers (Stripe) and 2 of 5 fulfillment methods (pickup, own-driver) are real implementations; the rest are stubs returning `501`.
- **PR-7** — Frontend test coverage is minimal (~4% of `.tsx` files).
- **PR-11** — No caching layer for read-heavy public traffic (deliberately deferred in Phase 5, Medium risk).
- **PR-12** — `LoyaltyAccount`/`GiftCard` schema models exist with zero application code — confirmed dead.

### Sandbox-environment limitations (recur across nearly every phase)

This entire effort was executed in a sandboxed environment with **no live cloud infrastructure** — no reachable managed Postgres/S3/Redis/Sentry provider, and Docker Hub image pulls blocked outright. Every phase's real-infrastructure verification was substituted with the most rigorous available alternative in this environment specifically:
- Real local PostgreSQL 16 and Redis instances (not cloud-hosted) for all database/cache work, including the Phase 10 restore drill and Phase 11 load tests.
- The **compiled** server (`node dist/src/index.js`), never `tsx`/dev-mode, for every real-boot smoke test.
- Mocked SDKs (a fake `@aws-sdk/client-s3`, a fake `@sentry/node`) for the two services with genuinely no local substitute (real S3-compatible object storage, real error-tracking dashboards).

**None of this has been verified against a real cloud deployment.** The single highest-priority action before any real production traffic is a staged-environment run reproducing at minimum: Phase 1's migration against a real managed Postgres, Phase 4's containers actually built and run via `docker compose up` against real image registries, Phase 7's S3 implementation against a real bucket, Phase 9's Sentry integration against a real DSN, and Phase 10's restore drill against a real managed-provider snapshot.

---

## 3. Production readiness assessment

| Dimension | Status | Notes |
|---|---|---|
| **Correctness (Critical/High)** | ✅ Strong | 0 Critical / 0 High findings open (Sprint 07.6/07.7 fully remediated). |
| **Correctness (newly found)** | ⚠️ 2 open findings | Order-number and config-singleton races under concurrent load (§2) — real, reproducible, not yet fixed. |
| **Observability** | ✅ Strong | Structured logging, error tracking (needs a real DSN), metrics, worker-health all in place (Phase 9). |
| **Deployability** | ✅ Strong, not yet exercised live | Containers, health/readiness, graceful shutdown, secrets management all in place (Phases 3–4) — never actually run via `docker compose up` in this sandbox (Docker Hub blocked). |
| **Data durability** | ✅ Strong | Migrations, object storage, a *tested* restore drill (Phase 1, 7, 10) — the restore-drill mechanics are proven; a real managed-provider snapshot restore is not. |
| **Scalability** | ✅ Measured, ⚠️ not yet load-tested at production scale | Real numbers exist (Phase 11) from a 4-vCPU sandbox; connection-pool sizing recommendation given but not deployed. |
| **Feature completeness** | ⚠️ Partial by design | 1/6 payment providers, 2/5 fulfillment methods real (PR-6) — sufficient for a pickup/delivery-by-own-driver restaurant paying by card; not sufficient for a restaurant needing DoorDash/Uber Eats courier integration or a non-Stripe payment processor. |
| **Frontend test coverage** | ⚠️ Weak | ~4% coverage (PR-7) — a real regression risk for UI changes going forward, not addressed by this effort. |

---

## 4. Infrastructure checklist (before first production deployment)

- [ ] Provision a managed PostgreSQL 16+ instance with SSL-required connections, automated daily backups (7-30 day retention), and PITR enabled (`docs/runbooks/database-setup.md` §1, `disaster-recovery.md` §1.1).
- [ ] Run `prisma migrate deploy` against it; confirm `prisma migrate status` reports up to date.
- [ ] Provision a real S3-compatible bucket (AWS S3, R2, or B2); set `OBJECT_STORAGE_*` env vars; run `apps/api/scripts/migrate-storage-to-s3.ts` if any data already exists on local disk; enable bucket versioning + a noncurrent-version lifecycle rule (30-90 days) (`disaster-recovery.md` §1.2).
- [ ] Decide the public-asset serving strategy: direct-from-CDN (`OBJECT_STORAGE_PUBLIC_URL_BASE`, recommended) vs. proxied through the API (`docs/runbooks/object-storage.md`).
- [ ] Provision a managed Redis instance; set `REDIS_URL`.
- [ ] Build and push real container images (`apps/api/Dockerfile`, `apps/web/Dockerfile`) to a real registry — **not yet done in this sandbox**; this is the first genuinely unverified step.
- [ ] Configure all core secrets (`JWT_ACCESS_SECRET`, `COMMERCE_ENCRYPTION_KEY`, etc.) via the hosting platform's secrets manager — **never** the `.env.example` placeholder values (`assertStartupEnv` will refuse to boot with a placeholder under `NODE_ENV=production`).
- [ ] Set `SENTRY_DSN` to a real project DSN; confirm a deliberate test error appears in the dashboard.
- [ ] Set `LOG_LEVEL` (default `info` is reasonable for production).
- [ ] Wire `/health`, `/ready`, and `/metrics` into the orchestrator's health checks and a Prometheus scrape target (or equivalent).
- [ ] Configure CD (`deploy.yml`) with real registry/deployment credentials; confirm the health-check-gated rollout actually gates on `/ready`.
- [ ] Size `DATABASE_URL`'s `connection_limit` deliberately (Phase 11 measured ~10/instance at Prisma's default; multiply by planned instance count against the provider's `max_connections` ceiling — `LOAD_TEST_RESULTS.md` Finding 2).
- [ ] Configure branch protection requiring the CI check to pass before merge to `main` (a repository-settings change, not a code change — Phase 2).

## 5. Launch checklist (application-level)

- [ ] **Fix the two Phase 11 findings** (order-number race, config-singleton race) before onboarding any restaurant expected to see concurrent order volume — see §2.
- [ ] Confirm the onboarded restaurant(s)' actual needs match current real-provider coverage: Stripe for payments, pickup and/or own-driver for fulfillment. If a restaurant needs a different payment processor or a third-party courier, that provider's stub must be implemented first (PR-6).
- [ ] If SMS driver-dispatch notifications matter for the launch restaurant(s)' delivery operations, implement a real SMS provider (PR-5) — today it silently no-ops.
- [ ] Run the full staged-environment verification pass described in §2's "Sandbox-environment limitations" before the first real restaurant's first real order.
- [ ] Confirm the admin bootstrap flow (`prisma/seed.ts`) has been run against production with real `ADMIN_EMAIL`/`ADMIN_PASSWORD`, not placeholder values.
- [ ] Confirm CORS (`FRONTEND_URL`) and any custom-domain routing (`SITE_PLATFORM_DOMAIN`) point at real production hostnames.
- [ ] Walk through the disaster-recovery communication plan (`disaster-recovery.md` §5) with whoever will be on call.

## 6. Recommended beta rollout plan

1. **Single restaurant, staged environment first.** Deploy to a real staged environment (not this sandbox) reproducing the full stack — real Postgres/Redis/S3, real containers, real Sentry — before any restaurant sees it. Run Phase 10's restore drill and Phase 11's load test against that staged environment to confirm the sandbox's numbers transfer.
2. **One pilot restaurant, pickup-only, card payment only, cash-on-delivery as fallback.** This exercises the fully-real code paths (Stripe, pickup fulfillment) without depending on any stub. Monitor `/health`'s worker snapshot and `/metrics` daily for the first two weeks.
3. **Fix the two Phase 11 findings before the pilot restaurant's first lunch/dinner rush** — the load test showed these race under exactly that kind of concurrent-same-restaurant traffic, and a single restaurant's own rush is enough to trigger them (they don't require multi-tenant volume).
4. **Expand to 2-3 pilot restaurants** over the following 2-4 weeks, still pickup/card-only, to validate multi-tenant behavior (rate-limit isolation, per-restaurant data correctness) with real, non-synthetic traffic patterns.
5. **Re-run the load test** (`load-tests/run-load-test.sh`) against the staged environment at that point with real traffic-pattern data informing scenario sizing, and re-measure the connection-pool/throughput numbers now that the two known races are fixed — the real ceiling is likely higher than this report's ~60-67 req/sec, since a meaningful fraction of every request's latency here was spent on a transaction that was going to abort.
6. **Only then** consider onboarding restaurants needing delivery-courier integrations or non-Stripe payment providers, once those specific providers are implemented (PR-6).

## 7. Recommended first-production-deployment plan

1. Provision infrastructure per §4's checklist, in a real cloud environment.
2. Deploy via the CD pipeline (`deploy.yml`) once it's pointed at real credentials — confirm the health-check-gated rollout actually blocks traffic shift until `/ready` succeeds.
3. Run `scripts/restore-drill.sh` against the *real* production database once (not a throwaway copy of it — a genuinely separate throwaway database created via the same script) before the first restaurant's first order, to confirm the restore mechanics the sandbox proved also work against the real managed-provider setup.
4. Confirm `/metrics` is being scraped and `/health`'s worker snapshot is being monitored from day one — Phase 9's whole point was not repeating the "no visibility during the highest-risk moment" gap.
5. Keep the first production deployment to a single instance initially; only add a second instance (and re-plan connection-pool sizing per Finding 2) once real traffic data justifies it, consistent with this plan's own "don't do premature scaling work" philosophy (already applied in Phase 5's caching deferral and Phase 11's own connection-pooler deferral).
6. Schedule the first quarterly restore-drill re-run 3 months out (`disaster-recovery.md` §6).

## 8. Risk assessment

| Risk | Severity | Likelihood | Mitigation status |
|---|---|---|---|
| Order-number/config-singleton races cause failed checkouts under real concurrent load | **High** | High (confirmed to trigger under a single busy restaurant's rush, not just multi-tenant volume) | Documented, not fixed. **Recommend fixing before any pilot restaurant goes live.** |
| Staged/production infrastructure behaves differently than this sandbox's local substitutes | Medium | Medium | Every phase's own report flags this explicitly; §2's checklist is the direct mitigation. |
| A restaurant needs a payment/fulfillment provider that's still a stub | Medium | Medium (depends entirely on which restaurants onboard first) | Known, scoped (PR-6), not blocking for a Stripe+pickup/own-driver restaurant. |
| Error tracking has never been exercised against a real Sentry dashboard | Low | Low | Structured logging (Phase 9) already captures the same errors durably regardless; Sentry is additive visibility, not the only safety net. |
| Frontend regressions go undetected (weak test coverage) | Medium | Medium, ongoing | Not addressed by this effort (PR-7) — a real, standing risk for any UI change going forward. |
| 19 Medium / 10 Low findings from Sprint 07.6 remain open | Low-Medium (varies per finding) | N/A | Tracked, not scheduled — review `SPRINT_07_6_REMEDIATION_PLAN.md` before launch to confirm none are launch-blocking for the specific restaurant(s) onboarding first. |

## 9. Final recommendation

# **Not Ready** for first paying restaurants — with a short, well-defined path to Ready.

The infrastructure hardening work (Phases 1–11) is genuinely complete and well-verified within this environment's real constraints: migrations, containers, secrets, Redis, background-worker safety, object storage, image optimization, observability, a *tested* (not just configured) backup/restore story, and real measured load-test data all exist and work. Sprint 07.6/07.7 closed every Critical and High correctness/security finding.

**What stands between here and Ready:**

1. **The two Phase 11 findings (order-number race, config-singleton race) are real, reproducible, and will cause failed checkouts for any restaurant with concurrent order volume — including a single restaurant's own lunch rush, not just multi-tenant load.** These should be fixed and re-verified (ideally by re-running `load-tests/run-load-test.sh` and confirming a clean 100% success rate) before any restaurant takes real orders.
2. **Nothing in this 11-phase effort has been verified against real cloud infrastructure** — every verification substituted the most rigorous available local alternative, but a staged-environment run reproducing the real stack (§2, §6 step 1) has not happened yet and is the natural next action, not an optional one.
3. Feature scope for the first restaurant(s) should be deliberately matched to what's genuinely implemented (Stripe + pickup/own-driver) rather than assumed to cover everything in the schema/registry.

None of these are large efforts relative to what's already been built — the recommended beta rollout plan (§6) is measured in weeks, not months, and is the shortest honest path from here to a real paying restaurant's first order.
