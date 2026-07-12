import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
  vi.doUnmock("@sentry/node");
  vi.doUnmock("./logger");
  vi.doUnmock("../config/env");
});

describe("createErrorTracker", () => {
  it("returns a no-op tracker when SENTRY_DSN is unset (default, matches pre-Phase-9 behavior)", async () => {
    delete process.env.SENTRY_DSN;
    const sentryInit = vi.fn();
    const sentryCapture = vi.fn();
    vi.doMock("@sentry/node", () => ({ init: sentryInit, captureException: sentryCapture }));
    vi.resetModules();

    const { createErrorTracker } = await import("./error-tracker.js");
    const tracker = createErrorTracker();
    tracker.captureException(new Error("boom"));

    expect(sentryInit).not.toHaveBeenCalled();
    expect(sentryCapture).not.toHaveBeenCalled();
  });

  it("initializes Sentry and forwards captured exceptions when SENTRY_DSN is set", async () => {
    const sentryInit = vi.fn();
    const sentryCapture = vi.fn();
    vi.doMock("@sentry/node", () => ({ init: sentryInit, captureException: sentryCapture }));
    vi.doMock("./logger", () => ({ getRequestContext: () => ({ requestId: "req-1", restaurantId: "restaurant-1" }) }));
    vi.doMock("../config/env", () => ({ getEnv: () => ({ NODE_ENV: "production" }), getOptionalEnv: (name: string) => (name === "SENTRY_DSN" ? "https://example.invalid/1" : undefined) }));
    vi.resetModules();

    const { createErrorTracker } = await import("./error-tracker.js");
    const tracker = createErrorTracker();

    expect(sentryInit).toHaveBeenCalledWith({ dsn: "https://example.invalid/1", environment: "production" });

    const error = new Error("boom");
    tracker.captureException(error, { orderId: "order-1" });

    expect(sentryCapture).toHaveBeenCalledWith(error, {
      tags: { requestId: "req-1", restaurantId: "restaurant-1" },
      extra: { orderId: "order-1" },
    });
  });

  it("still tags requestId/restaurantId as undefined rather than throwing when captured outside any request context", async () => {
    const sentryCapture = vi.fn();
    vi.doMock("@sentry/node", () => ({ init: vi.fn(), captureException: sentryCapture }));
    vi.doMock("./logger", () => ({ getRequestContext: () => undefined }));
    vi.doMock("../config/env", () => ({ getEnv: () => ({ NODE_ENV: "production" }), getOptionalEnv: (name: string) => (name === "SENTRY_DSN" ? "https://example.invalid/1" : undefined) }));
    vi.resetModules();

    const { createErrorTracker } = await import("./error-tracker.js");
    const tracker = createErrorTracker();
    tracker.captureException(new Error("boom"));

    expect(sentryCapture).toHaveBeenCalledWith(expect.any(Error), {
      tags: { requestId: undefined, restaurantId: undefined },
      extra: undefined,
    });
  });
});
