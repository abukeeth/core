import { describe, expect, it, vi } from "vitest";

const { mockLoggerError, mockLoggerDebug, mockCaptureException } = vi.hoisted(() => ({
  mockLoggerError: vi.fn(),
  mockLoggerDebug: vi.fn(),
  mockCaptureException: vi.fn(),
}));

vi.mock("../../../lib/logger", () => ({ createLogger: () => ({ error: mockLoggerError, debug: mockLoggerDebug }) }));
vi.mock("../../../lib/error-tracker", () => ({ errorTracker: { captureException: mockCaptureException } }));

import { commerceEventBus } from "./event-bus";

describe("commerceEventBus", () => {
  it("delivers events to a handler registered for that type", async () => {
    const handler = vi.fn();
    commerceEventBus.on("ORDER_CREATED", handler);

    commerceEventBus.emit({ type: "ORDER_CREATED", restaurantId: "r1", orderId: "o1" });

    await vi.waitFor(() => expect(handler).toHaveBeenCalledWith({ type: "ORDER_CREATED", restaurantId: "r1", orderId: "o1" }));
  });

  it("delivers every event to a wildcard handler", async () => {
    const handler = vi.fn();
    commerceEventBus.on("*", handler);

    commerceEventBus.emit({ type: "ORDER_CONFIRMED", restaurantId: "r2", orderId: "o2" });

    await vi.waitFor(() => expect(handler).toHaveBeenCalled());
  });

  it("does not let a throwing handler affect other handlers, and reports it via the structured logger + error tracker (Production Hardening Phase 9)", async () => {
    const okHandler = vi.fn();
    commerceEventBus.on("PAYMENT_FAILED", () => {
      throw new Error("boom");
    });
    commerceEventBus.on("PAYMENT_FAILED", okHandler);

    commerceEventBus.emit({ type: "PAYMENT_FAILED", restaurantId: "r3", orderId: "o3" });

    await vi.waitFor(() => expect(okHandler).toHaveBeenCalled());
    expect(mockLoggerError).toHaveBeenCalledWith({ err: expect.any(Error), eventType: "PAYMENT_FAILED" }, expect.stringContaining("PAYMENT_FAILED"));
    expect(mockCaptureException).toHaveBeenCalledWith(expect.any(Error), { eventType: "PAYMENT_FAILED" });
  });

  it("the module's built-in debug-log subscriber receives every emitted event (Sprint 07.7 H-10 smoke test)", async () => {
    commerceEventBus.emit({ type: "ORDER_READY", restaurantId: "r4", orderId: "o4" });

    await vi.waitFor(() =>
      expect(mockLoggerDebug).toHaveBeenCalledWith({ orderId: "o4", restaurantId: "r4" }, expect.stringContaining("ORDER_READY")),
    );
  });
});
