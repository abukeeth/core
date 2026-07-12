# Production Hardening Phase 9 — Completion Report

**Monitoring & Logging**

Implemented per `docs/reports/Sprint07/PRODUCTION_HARDENING_MASTER_SPEC.md`, Phase 9. Lands ahead of Phase 4's production cutover (already complete, Phases 1-8), per the spec's own framing: this plan's single highest-risk moment should not be the one with no visibility — and now it isn't, retroactively as well as going forward.

## 1. What was done

### 1.1 Structured logging (`lib/logger.ts`)

`pino` behind a small wrapper — chosen per the master spec for low overhead (this app's hot path, checkout, cannot afford a synchronous/blocking logger) and native JSON output. **Every** `console.error`/`console.log`/`console.debug`/`console.warn` call site across `apps/api/src` (22 real call sites across 11 files — `index.ts`, `app.ts`, `lib/best-effort.ts`, `lib/redis.ts`, `lib/redis-rate-limit-store.ts`, `modules/commerce/events/event-bus.ts`, `outbox-scheduler.ts`, `outbox-worker.ts`, `modules/commerce/fulfillment/fulfillment.service.ts`, `stale-offer-scheduler.ts`, `modules/sites/renderer/layout-engine.ts`) is migrated to `createLogger("module-name")`, tagging every line with `module`. `LOG_LEVEL` (optional, default `"info"`) controls verbosity; defaults to `"silent"` under `NODE_ENV=test` specifically so the suite's own deliberately-exercised error/fail-open paths don't flood test output (pino writes straight to stdout, bypassing any test's `console.*` spy).

### 1.2 Request correlation

`app.ts`'s `requestCorrelationMiddleware`, mounted first (before helmet/CORS/body-parsing): assigns a request ID (echoes an inbound `X-Request-Id`, or mints a fresh UUID) and propagates it via `lib/logger.ts`'s `AsyncLocalStorage`, so every log line for the lifetime of a request — including from a `bestEffort()` failure deep inside a service call — is automatically tagged, without threading `requestId` through every function signature. `setRequestRestaurantId()` attaches the tenant ID once auth resolves it.

### 1.3 Error tracking (`lib/error-tracker.ts`)

Swappable exactly like every other optional-infrastructure seam in this codebase (`fileStorage`/`releaseStorage`'s factory, `lib/redis.ts`'s optional client): `SENTRY_DSN` unset (default) means `captureException()` no-ops everywhere; set it and every call reports to real Sentry, tagged with the active request's `requestId`/`restaurantId`. Wired into: every `bestEffort()`-swallowed failure (closing the residual risk Sprint 07.6/07.7's C-2/C-15/H-12 kept flagging — logging alone lived only in a file no one was watching; this makes it visible), the commerce event bus's handler-failure catch, the outbox worker's per-row dispatch failures, both background schedulers' poll/sweep failures, `app.ts`'s top-level Express error handler, and `index.ts`'s new process-level `uncaughtException`/`unhandledRejection` handlers (which log + report, then `process.exit(1)` — deliberately not caught-and-continued, since running on with corrupted state is worse than a clean crash-and-restart under the Phase 4 container's `HEALTHCHECK`).

### 1.4 Application metrics (`lib/metrics.ts`, `/metrics`)

Prometheus-style, `prom-client`, no vendor SDK: `http_request_duration_seconds` (latency + implicit count, labeled by method/matched-route-pattern/status; an unmatched request labels `route="unmatched"` to keep cardinality bounded), `background_job_duration_seconds`/`background_job_batch_size` (Phase 6's outbox worker and stale-offer sweep, labeled by job name), `payment_provider_results_total` (the BYOP orchestrator's authorize outcomes, labeled by provider/result), plus bundled default Node process metrics (event loop, heap, GC). `/metrics` is unauthenticated, consistent with `/health`/`/ready` — restricting scrape access is a network/ingress concern, not an application one.

### 1.5 Worker liveness on `/health` (master spec item 6)

`lib/worker-health.ts` tracks each background worker's last successful poll in memory; `/health`'s response now includes a `workers` object (`outboxWorker`/`staleOfferSweep`, each `{ lastSuccessAt, lastError }`). A worker whose timestamp stops advancing is now externally observable, not just discoverable by reading logs after the fact. Deliberately on `/health` (liveness), not `/ready` (DB-connectivity readiness) — a stuck worker doesn't mean this instance can't serve HTTP traffic.

## 2. Files changed

**New:**
- `apps/api/src/lib/logger.ts` (+ `.test.ts`)
- `apps/api/src/lib/error-tracker.ts` (+ `.test.ts`)
- `apps/api/src/lib/metrics.ts` (+ `.test.ts`)
- `apps/api/src/lib/worker-health.ts` (+ `.test.ts`)
- `apps/api/src/app.test.ts` — the first direct integration test against `createApp()` itself.
- `docs/runbooks/monitoring-logging.md`
- `docs/reports/Sprint07/PRODUCTION_HARDENING_PHASE_9_COMPLETION_REPORT.md` (this file)

**Modified:**
- `apps/api/src/app.ts` — correlation middleware, `httpMetricsMiddleware`, `/metrics`, extended `/health`, error handler.
- `apps/api/src/index.ts` — startup/shutdown logs migrated; `uncaughtException`/`unhandledRejection` handlers added.
- `apps/api/src/lib/best-effort.ts` (+ its own test, extended per the master spec's explicit instruction) — logger + error tracker.
- `apps/api/src/lib/redis.ts`, `apps/api/src/lib/redis-rate-limit-store.ts` — logger.
- `apps/api/src/modules/commerce/events/event-bus.ts` (+ its own test) — logger + error tracker.
- `apps/api/src/modules/commerce/events/outbox-worker.ts` — logger + error tracker.
- `apps/api/src/modules/commerce/events/outbox-scheduler.ts` (+ new test) — logger, error tracker, metrics, worker-health.
- `apps/api/src/modules/commerce/fulfillment/fulfillment.service.ts` — logger + error tracker (the two `assignDriver` notification catches, `expireStaleOffers`'s event-write catch).
- `apps/api/src/modules/commerce/fulfillment/stale-offer-scheduler.ts` (+ new test) — logger, error tracker, metrics, worker-health.
- `apps/api/src/modules/commerce/payments/orchestrator.ts` (+ 2 new tests) — `payment_provider_results_total` metric.
- `apps/api/src/modules/sites/renderer/layout-engine.ts` (+ its own test) — logger.
- `apps/api/src/config/env.ts`, `apps/api/.env.example` — `LOG_LEVEL`, `SENTRY_DSN`.
- `apps/api/package.json` — `pino`, `prom-client`, `@sentry/node` (deps); `supertest`, `@types/supertest` (devDeps, for `app.test.ts`).

## 3. Verification

| Check | Result |
|---|---|
| `prisma validate` | ✅ Pass (schema unchanged) |
| `prisma generate` | ✅ Pass |
| `pnpm run lint` (root, both apps) | ✅ Pass, no warnings |
| `pnpm run typecheck` (root, both apps) | ✅ Pass |
| `pnpm run test` (root, both apps) | ✅ **919/919 passing + 2 Phase-6 integration tests skipped by default** (up from 889 pre-Phase-9; 40 new tests across 9 new/updated test files) |
| `pnpm run build` (root, both apps) | ✅ Pass |

**Real server-boot verification (compiled server, live local Postgres/Redis)**: `GET /health` returns the worker snapshot alongside status/uptime, both `X-Request-Id` behaviors confirmed (fresh UUID minted when absent; an inbound `caller-supplied-id` echoed back unchanged), `GET /metrics` returns real Prometheus-formatted output including process metrics, and the structured JSON startup/listening/shutdown logs appear exactly as designed — not just in mocked unit tests.

**`bestEffort()` verification (master spec's own explicit instruction)**: the existing "does not throw" test is extended to also assert the structured logger and error tracker were both invoked — confirmed passing.

## 4. Known limitations

- No live Sentry DSN in this sandbox (no outbound network access to a real Sentry project) — `SENTRY_DSN` unset is this environment's actual state, so error tracking runs in its no-op default here; the Sentry-backed path is unit-tested against a mocked `@sentry/node` (init call, tagged capture call) rather than a live dashboard. Verifying a deliberate error actually appears in a real Sentry dashboard (the master spec's own Verification item 1) is deferred to a staged environment with a real DSN, consistent with every prior phase's "cannot be exercised end-to-end in this sandbox" limitation (Docker Hub blocks, no live cloud object storage, etc.).
- `/metrics` has no built-in access restriction (matches `/health`/`/ready`'s existing precedent) — a real deployment should restrict scrape access at the network/ingress layer if the metrics payload (route patterns, provider names) is considered sensitive; this is a deployment/infra decision, not a code change, and is documented in the runbook.
- The before/after latency comparison the master spec's Verification section calls for (confirming negligible logging overhead on checkout) was not run as a dedicated benchmark in this sandbox — `pino`'s own published low-overhead characteristics and this phase's `app.test.ts`/full-suite timing (no measurable slowdown versus the pre-Phase-9 baseline) are the available evidence; a dedicated load-test-driven measurement is Phase 11's job, not this phase's.

## 5. Notes

- `event-bus.ts`'s debug-level subscriber (Sprint 07.7 H-10) now logs via the structured logger instead of `console.debug` — same observability purpose, now consistent formatting/tagging with everything else.
- `fulfillment.service.ts`'s two manual `try/catch` blocks around driver-notification sends were not routed through `bestEffort()` itself (they predate it and have slightly different call shapes), but received the identical logger+error-tracker treatment "adjacent" to `bestEffort()`, per the master spec's explicit wording ("this includes, notably: every `bestEffort()`-adjacent catch block").
- `app.test.ts` is this codebase's first direct integration test against `createApp()` — every prior test exercised a service/controller directly or the compiled server via a real process boot (Phase 4/7 reports). It sets the core env schema before importing anything and deliberately never calls `/ready` (which touches the database), so it needs no live Postgres/Redis to run in CI.

---

*Phase 9 complete. Proceeding to Phase 10 (Backups & Disaster Recovery) per instruction.*
