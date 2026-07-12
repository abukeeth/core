import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockProcessOutboxBatch, mockLoggerError, mockCaptureException, mockRecordWorkerSuccess, mockRecordWorkerFailure } = vi.hoisted(() => ({
  mockProcessOutboxBatch: vi.fn(),
  mockLoggerError: vi.fn(),
  mockCaptureException: vi.fn(),
  mockRecordWorkerSuccess: vi.fn(),
  mockRecordWorkerFailure: vi.fn(),
}));

vi.mock("./outbox-worker", () => ({ processOutboxBatch: mockProcessOutboxBatch }));
vi.mock("../../../lib/logger", () => ({ createLogger: () => ({ error: mockLoggerError }) }));
vi.mock("../../../lib/error-tracker", () => ({ errorTracker: { captureException: mockCaptureException } }));
vi.mock("../../../lib/worker-health", () => ({ recordWorkerSuccess: mockRecordWorkerSuccess, recordWorkerFailure: mockRecordWorkerFailure }));

import { __resetMetricsForTests, getMetrics } from "../../../lib/metrics";
import { startOutboxWorker } from "./outbox-scheduler";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  __resetMetricsForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startOutboxWorker (Production Hardening Phase 9)", () => {
  it("records a successful poll's batch size and marks the worker healthy", async () => {
    mockProcessOutboxBatch.mockResolvedValue({ processedCount: 7 });
    const timer = startOutboxWorker();

    await vi.advanceTimersByTimeAsync(5_000);

    expect(mockRecordWorkerSuccess).toHaveBeenCalledWith("outboxWorker");
    expect(mockRecordWorkerFailure).not.toHaveBeenCalled();
    const output = await getMetrics();
    expect(output).toContain("background_job_duration_seconds");
    expect(output).toContain('background_job_batch_size_sum{job="outbox_worker"} 7');

    clearInterval(timer);
  });

  it("logs and reports a failed poll to the error tracker, and records it as a worker failure rather than crashing the interval", async () => {
    const error = new Error("db down");
    mockProcessOutboxBatch.mockRejectedValue(error);
    const timer = startOutboxWorker();

    await vi.advanceTimersByTimeAsync(5_000);

    expect(mockLoggerError).toHaveBeenCalledWith({ err: error }, "outbox-scheduler: poll failed");
    expect(mockCaptureException).toHaveBeenCalledWith(error);
    expect(mockRecordWorkerFailure).toHaveBeenCalledWith("outboxWorker", error);

    clearInterval(timer);
  });
});
