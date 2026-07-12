import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockExpireStaleOffers, mockLoggerError, mockCaptureException, mockRecordWorkerSuccess, mockRecordWorkerFailure } = vi.hoisted(() => ({
  mockExpireStaleOffers: vi.fn(),
  mockLoggerError: vi.fn(),
  mockCaptureException: vi.fn(),
  mockRecordWorkerSuccess: vi.fn(),
  mockRecordWorkerFailure: vi.fn(),
}));

vi.mock("./fulfillment.service", () => ({ expireStaleOffers: mockExpireStaleOffers }));
vi.mock("../../../lib/logger", () => ({ createLogger: () => ({ error: mockLoggerError }) }));
vi.mock("../../../lib/error-tracker", () => ({ errorTracker: { captureException: mockCaptureException } }));
vi.mock("../../../lib/worker-health", () => ({ recordWorkerSuccess: mockRecordWorkerSuccess, recordWorkerFailure: mockRecordWorkerFailure }));

import { __resetMetricsForTests, getMetrics } from "../../../lib/metrics";
import { startStaleOfferScheduler } from "./stale-offer-scheduler";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  __resetMetricsForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startStaleOfferScheduler (Production Hardening Phase 9)", () => {
  it("records a successful sweep's batch size and marks the worker healthy", async () => {
    mockExpireStaleOffers.mockResolvedValue({ expiredCount: 3 });
    const timer = startStaleOfferScheduler();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockRecordWorkerSuccess).toHaveBeenCalledWith("staleOfferSweep");
    expect(mockRecordWorkerFailure).not.toHaveBeenCalled();
    const output = await getMetrics();
    expect(output).toContain('background_job_batch_size_sum{job="stale_offer_sweep"} 3');

    clearInterval(timer);
  });

  it("logs and reports a failed sweep to the error tracker, and records it as a worker failure rather than crashing the interval", async () => {
    const error = new Error("db down");
    mockExpireStaleOffers.mockRejectedValue(error);
    const timer = startStaleOfferScheduler();

    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockLoggerError).toHaveBeenCalledWith({ err: error }, "stale-offer-scheduler: sweep failed");
    expect(mockCaptureException).toHaveBeenCalledWith(error);
    expect(mockRecordWorkerFailure).toHaveBeenCalledWith("staleOfferSweep", error);

    clearInterval(timer);
  });
});
