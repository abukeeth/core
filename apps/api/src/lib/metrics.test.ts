import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetMetricsForTests,
  backgroundJobBatchSize,
  backgroundJobDurationSeconds,
  getMetrics,
  getMetricsContentType,
  httpMetricsMiddleware,
  httpRequestDurationSeconds,
  paymentProviderResultsTotal,
} from "./metrics";

beforeEach(() => {
  __resetMetricsForTests();
});

describe("metrics registry", () => {
  it("exposes a Prometheus-compatible content type", () => {
    expect(getMetricsContentType()).toMatch(/text\/plain/);
  });

  it("includes every named metric in the exported text once observed", async () => {
    httpRequestDurationSeconds.observe({ method: "GET", route: "/health", status_code: "200" }, 0.01);
    backgroundJobDurationSeconds.observe({ job: "outbox_worker" }, 0.02);
    backgroundJobBatchSize.observe({ job: "outbox_worker" }, 5);
    paymentProviderResultsTotal.inc({ provider: "STRIPE", result: "success" });

    const output = await getMetrics();
    expect(output).toContain("http_request_duration_seconds");
    expect(output).toContain("background_job_duration_seconds");
    expect(output).toContain("background_job_batch_size");
    expect(output).toContain("payment_provider_results_total");
  });

  it("also includes default Node process metrics (event loop/memory)", async () => {
    const output = await getMetrics();
    expect(output).toMatch(/process_cpu_user_seconds_total|nodejs_/);
  });
});

describe("httpMetricsMiddleware", () => {
  function makeReqRes(overrides: { routePath?: string; baseUrl?: string; statusCode?: number } = {}) {
    let finishHandler: (() => void) | undefined;
    const res = {
      statusCode: overrides.statusCode ?? 200,
      on: vi.fn((event: string, handler: () => void) => {
        if (event === "finish") finishHandler = handler;
      }),
    };
    const req = {
      method: "GET",
      baseUrl: overrides.baseUrl ?? "/api/restaurants",
      route: overrides.routePath ? { path: overrides.routePath } : undefined,
    };
    return { req, res, fireFinish: () => finishHandler?.() };
  }

  it("records an observation labeled with the matched route pattern, not the raw URL", async () => {
    const { req, res, fireFinish } = makeReqRes({ routePath: "/:id", baseUrl: "/api/restaurants" });
    const next = vi.fn();

    httpMetricsMiddleware(req as never, res as never, next);
    expect(next).toHaveBeenCalledTimes(1);
    fireFinish();

    const output = await getMetrics();
    expect(output).toContain('route="/api/restaurants/:id"');
  });

  it("labels an unmatched request (no req.route) as \"unmatched\" rather than the raw path", async () => {
    const { req, res, fireFinish } = makeReqRes({ routePath: undefined, statusCode: 404 });
    const next = vi.fn();

    httpMetricsMiddleware(req as never, res as never, next);
    fireFinish();

    const output = await getMetrics();
    expect(output).toContain('route="unmatched"');
    expect(output).toContain('status_code="404"');
  });
});
