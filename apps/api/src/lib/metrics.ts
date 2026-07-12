import client from "prom-client";
import type { NextFunction, Request, Response } from "express";

/**
 * Production Hardening Phase 9 — basic application metrics, Prometheus-
 * style, exported via a `/metrics` endpoint (app.ts) rather than a vendor
 * APM SDK: no new infrastructure dependency beyond a scrape target, and
 * it's the de facto standard shape most hosting providers/ops tooling
 * already know how to consume.
 *
 * A dedicated `Registry` (not `client.register`, prom-client's global
 * default) so this module's metrics don't leak into or collide with
 * anything else in the same process across test files that import it
 * repeatedly in the same Vitest worker.
 */
const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

/** Request latency (and, implicitly, count via the histogram's `_count` series) by method/route/status_code. `route` is the matched Express route pattern (e.g. "/api/restaurants/:id"), not the raw URL, to keep label cardinality bounded — an unmatched request (404 before any router claims it) is labeled "unmatched" rather than the raw path. */
export const httpRequestDurationSeconds = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

/** Background-worker batch/sweep wall-clock duration (Phase 6's outbox worker and stale-offer sweep), labeled by job name. */
export const backgroundJobDurationSeconds = new client.Histogram({
  name: "background_job_duration_seconds",
  help: "Background worker run duration in seconds",
  labelNames: ["job"] as const,
  buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

/** Rows processed per background-worker run, labeled by job name — a batch consistently pinned at its max size is the leading indicator of a worker falling behind. */
export const backgroundJobBatchSize = new client.Histogram({
  name: "background_job_batch_size",
  help: "Number of rows processed in a single background worker run",
  labelNames: ["job"] as const,
  buckets: [0, 1, 5, 10, 25, 50, 100],
  registers: [registry],
});

/** Payment-provider authorize outcomes, labeled by provider and result — the BYOP failover orchestrator's health at a glance. */
export const paymentProviderResultsTotal = new client.Counter({
  name: "payment_provider_results_total",
  help: "Count of payment provider authorize attempts by provider and result",
  labelNames: ["provider", "result"] as const,
  registers: [registry],
});

export function getMetricsContentType(): string {
  return registry.contentType;
}

export function getMetrics(): Promise<string> {
  return registry.metrics();
}

/** Test-only: clears all recorded metric values so unit tests don't leak state into each other across a shared module instance. Never call from application code. */
export function __resetMetricsForTests(): void {
  registry.resetMetrics();
}

function resolveRoutePattern(req: Request): string {
  const routePath = (req as Request & { route?: { path?: string } }).route?.path;
  if (!routePath) return "unmatched";
  return `${req.baseUrl}${routePath}`;
}

/** Express middleware recording one observation per completed response — mounted first in app.ts so it wraps every route, including ones that 404/error. */
export function httpMetricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const endTimer = httpRequestDurationSeconds.startTimer({ method: req.method });
  res.on("finish", () => {
    endTimer({ route: resolveRoutePattern(req), status_code: String(res.statusCode) });
  });
  next();
}
