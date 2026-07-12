import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockRunSslIssuanceSweep, mockLoggerError, mockCaptureException, mockRecordWorkerSuccess, mockRecordWorkerFailure } = vi.hoisted(() => ({
  mockRunSslIssuanceSweep: vi.fn(),
  mockLoggerError: vi.fn(),
  mockCaptureException: vi.fn(),
  mockRecordWorkerSuccess: vi.fn(),
  mockRecordWorkerFailure: vi.fn(),
}));

vi.mock("./domain.service", () => ({ runSslIssuanceSweep: mockRunSslIssuanceSweep }));
vi.mock("../../lib/logger", () => ({ createLogger: () => ({ error: mockLoggerError }) }));
vi.mock("../../lib/error-tracker", () => ({ errorTracker: { captureException: mockCaptureException } }));
vi.mock("../../lib/worker-health", () => ({ recordWorkerSuccess: mockRecordWorkerSuccess, recordWorkerFailure: mockRecordWorkerFailure }));

import { __resetMetricsForTests, getMetrics } from "../../lib/metrics";
import { startSslIssuanceScheduler } from "./ssl-issuance-scheduler";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  __resetMetricsForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startSslIssuanceScheduler (Sprint 20A Task 4)", () => {
  it("records a successful sweep's batch size and marks the worker healthy", async () => {
    mockRunSslIssuanceSweep.mockResolvedValue({ processedCount: 4 });
    const timer = startSslIssuanceScheduler();

    await vi.advanceTimersByTimeAsync(15_000);

    expect(mockRecordWorkerSuccess).toHaveBeenCalledWith("sslIssuanceSweep");
    expect(mockRecordWorkerFailure).not.toHaveBeenCalled();
    const output = await getMetrics();
    expect(output).toContain('background_job_batch_size_sum{job="ssl_issuance_sweep"} 4');

    clearInterval(timer);
  });

  it("logs and reports a failed sweep to the error tracker, and records it as a worker failure rather than crashing the interval", async () => {
    const error = new Error("db down");
    mockRunSslIssuanceSweep.mockRejectedValue(error);
    const timer = startSslIssuanceScheduler();

    await vi.advanceTimersByTimeAsync(15_000);

    expect(mockLoggerError).toHaveBeenCalledWith({ err: error }, "ssl-issuance-scheduler: sweep failed");
    expect(mockCaptureException).toHaveBeenCalledWith(error);
    expect(mockRecordWorkerFailure).toHaveBeenCalledWith("sslIssuanceSweep", error);

    clearInterval(timer);
  });
});
