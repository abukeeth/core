# Monitoring & Logging

Part of Production Hardening Phase 9 (`PRODUCTION_HARDENING_MASTER_SPEC.md`). Covers structured logging, request correlation, error tracking, application metrics, and worker-liveness reporting.

## Structured logging

`lib/logger.ts` wraps `pino`, chosen for low overhead (this app's hot path, checkout, cannot afford a synchronous/blocking logger) and native JSON output. Every prior `console.error`/`console.log`/`console.debug`/`console.warn` call site across `apps/api/src` has been migrated to it — `createLogger("module-name")` returns a child logger tagging every line with `module`, mirroring this codebase's existing one-file-per-concern convention.

`LOG_LEVEL` (optional, default `"info"`) controls verbosity. Under `NODE_ENV=test` it defaults to `"silent"` instead, since the test suite deliberately exercises many real error/fail-open paths (`bestEffort()`, the outbox worker's dispatch failures, `RedisRateLimitStore`'s fail-open branches) and `pino` writes straight to stdout rather than through `console.*`, so no test's own console spy would otherwise catch it — `LOG_LEVEL` set explicitly always wins, including in tests, for a developer who wants to see log output while debugging.

## Request correlation

`app.ts`'s `requestCorrelationMiddleware` is mounted first, before helmet/CORS/body-parsing, so every request — including one that fails a later check — gets a request ID: an inbound `X-Request-Id` header if the caller (a load balancer, an upstream proxy) already set one, otherwise a fresh UUID. It's echoed back on the response for the client's own correlation, and propagated via `lib/logger.ts`'s `AsyncLocalStorage` (`runWithRequestContext`), so every log line for the lifetime of that request — including ones from deep inside a service call or a `bestEffort()` failure — is automatically tagged with it via `pino`'s `mixin` hook, without any of those call sites needing to manually thread `requestId` through their own function signatures. `setRequestRestaurantId()` lets a handler attach the tenant ID once auth resolves it, without re-entering the context.

## Error tracking

`lib/error-tracker.ts` — swappable exactly like every other optional-infrastructure seam in this codebase (`fileStorage`/`releaseStorage`'s local-disk-vs-S3 factory, `lib/redis.ts`'s optional client). `SENTRY_DSN` unset (the default) means `errorTracker.captureException()` is a no-op everywhere it's called; set it to initialize real Sentry reporting, tagged with the active request's `requestId`/`restaurantId` when captured from inside a request.

Wired into every `bestEffort()`-swallowed failure (the exact residual risk Sprint 07.6/07.7's C-2/C-15/H-12 kept flagging: "an in-process try/catch cannot protect against the process itself dying" — error tracking doesn't change that, but it does make every *other* swallowed-but-real failure visible instead of living only in a log file no one is watching), the commerce event bus's handler-failure catch, the outbox worker's per-row dispatch failures, the background schedulers' poll/sweep failures, `app.ts`'s top-level Express error handler, and `index.ts`'s process-level `uncaughtException`/`unhandledRejection` handlers (which log + report, then exit — see "What an uncaught exception does" below).

## Application metrics

`/metrics` (Prometheus-style, `lib/metrics.ts`, no new infrastructure dependency beyond a scrape target) exposes:

- `http_request_duration_seconds` — latency (and, via its histogram `_count` series, implicit request count) labeled by `method`/`route`/`status_code`. `route` is the matched Express route pattern (e.g. `/api/restaurants/:id`), not the raw URL, to keep label cardinality bounded; an unmatched request is labeled `"unmatched"`.
- `background_job_duration_seconds` / `background_job_batch_size` — the outbox worker's and stale-offer sweep's (Phase 6) run duration and rows-processed-per-run, labeled by job name. A batch consistently pinned at its max size is the leading indicator of a worker falling behind.
- `payment_provider_results_total` — the BYOP failover orchestrator's authorize outcomes, labeled by `provider`/`result` (`success`/`requires_action`/`failure`). A provider's failure rate climbing shows up here before it shows up as a support ticket.
- Default Node process metrics (`collectDefaultMetrics`) — event loop lag, heap, GC pauses — bundled in for free.

No auth on `/metrics`: consistent with this app's other unauthenticated operational endpoints (`/health`, `/ready`). Restricting scrape access, if desired, is a network/ingress-level concern (an internal-only listener, a firewall rule, an ingress annotation), not an application-level one — a scraper is infrastructure, not an end user, the same reasoning already applied to `/health`/`/ready`.

## Worker liveness on `/health`

`lib/worker-health.ts` tracks each background worker's last successful poll in memory. `startOutboxWorker`/`startStaleOfferScheduler` (Phase 6) call `recordWorkerSuccess`/`recordWorkerFailure` after every run; `/health`'s response now includes a `workers` object:

```json
{
  "status": "ok",
  "uptime": 1234.5,
  "timestamp": "2026-01-01T00:00:00.000Z",
  "workers": {
    "outboxWorker": { "lastSuccessAt": "2026-01-01T00:00:00.000Z", "lastError": null },
    "staleOfferSweep": { "lastSuccessAt": "2026-01-01T00:00:00.000Z", "lastError": null }
  }
}
```

A worker whose `lastSuccessAt` stops advancing (compare against `OUTBOX_POLL_INTERVAL_MS`/`DRIVER_OFFER_SWEEP_INTERVAL_MS`) is wedged — externally observable now, not just discoverable by reading logs after the fact. Deliberately on `/health`, not `/ready`: a stuck worker doesn't mean this instance can't serve HTTP traffic, so it must not affect load-balancer routing decisions the way `/ready`'s DB check does.

## What an uncaught exception does

`index.ts` registers `process.on("uncaughtException", ...)` and `process.on("unhandledRejection", ...)`. Both log the error, report it to the error tracker, then call `process.exit(1)` — intentionally **not** caught-and-continued. Swallowing a genuinely uncaught exception and carrying on risks running with corrupted in-process state (a half-updated in-memory cache, a listener left in an inconsistent state), which is worse than a clean crash-and-restart under an orchestrator's restart policy (the container `HEALTHCHECK`/`/health` liveness probe from Phase 4 is exactly what notices the exit and restarts the instance). This is the process-level case bestEffort()'s in-process try/catch was always documented as unable to protect against — logging + reporting it here is the last chance to make it visible before the crash.

## Configuration

| Variable | Required | Notes |
|---|---|---|
| `LOG_LEVEL` | no (default `"info"`, `"silent"` under `NODE_ENV=test`) | `pino` level name (`fatal`/`error`/`warn`/`info`/`debug`/`trace`/`silent`). |
| `SENTRY_DSN` | no | Unset means error tracking no-ops; the structured logger already durably records the same errors either way. |

## Verification

- `logger.test.ts` — request-context propagation (including across concurrent contexts, proving `AsyncLocalStorage` isolation), `setRequestRestaurantId`'s no-op-outside-context safety, `createLogger`'s module-tagged child bindings.
- `error-tracker.test.ts` — no-op when `SENTRY_DSN` unset (default); initializes and forwards to Sentry with request-context tags when set; never throws when captured outside any request context.
- `best-effort.test.ts` — extended (per the master spec's own explicit verification instruction) to assert the structured logger *and* error tracker are both invoked on a swallowed failure, not just that the function still doesn't throw.
- `event-bus.test.ts` — a throwing handler's failure is logged + reported without affecting sibling handlers; the built-in debug-log subscriber still receives every emitted event, now via the structured logger.
- `metrics.test.ts` — every named metric appears in scraped output once observed; `httpMetricsMiddleware` labels a matched route by its pattern and an unmatched request as `"unmatched"`.
- `worker-health.test.ts` — records/reports success and failure independently per worker, without a failure clearing a prior success timestamp.
- `outbox-scheduler.test.ts` / `stale-offer-scheduler.test.ts` — a successful run records its batch size and marks the worker healthy; a failed run logs, reports, and records the worker as failed, without the `setInterval` itself throwing.
- `orchestrator.test.ts` — a successful and a failed authorize attempt each produce a distinct `payment_provider_results_total` observation labeled by provider and result.
- `app.test.ts` — the first direct integration test against `createApp()` itself: a request without an `X-Request-Id` gets a fresh UUID assigned and echoed back; an inbound one is preserved unchanged; `/health` includes the worker snapshot; `/metrics` returns a Prometheus-compatible scrape including the very request that fetched it.
