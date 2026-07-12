import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockLoggerError, mockCaptureException } = vi.hoisted(() => ({
  mockLoggerError: vi.fn(),
  mockCaptureException: vi.fn(),
}));

vi.mock("./logger", () => ({ createLogger: () => ({ error: mockLoggerError }) }));
vi.mock("./error-tracker", () => ({ errorTracker: { captureException: mockCaptureException } }));

import { bestEffort } from "./best-effort";

describe("bestEffort (Sprint 07.7 H-12; Production Hardening Phase 9)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs the action to completion when it succeeds", async () => {
    const action = vi.fn().mockResolvedValue(undefined);
    await bestEffort(action);
    expect(action).toHaveBeenCalledTimes(1);
    expect(mockLoggerError).not.toHaveBeenCalled();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("catches and logs via the structured logger, never rethrows, regardless of the wrapped action's failure mode", async () => {
    const error = new Error("boom");
    const action = vi.fn().mockRejectedValue(error);
    await expect(bestEffort(action)).resolves.toBeUndefined();
    expect(mockLoggerError).toHaveBeenCalledWith({ err: error }, "bestEffort: a best-effort post-success step failed");
  });

  it("forwards every swallowed failure to the error tracker, not just the log (Phase 9: swallowed failures must still be visible)", async () => {
    const error = new Error("boom");
    const action = vi.fn().mockRejectedValue(error);
    await bestEffort(action);
    expect(mockCaptureException).toHaveBeenCalledWith(error);
  });

  it("catches a thrown non-Error value too", async () => {
    const action = vi.fn().mockRejectedValue("a plain string rejection");
    await expect(bestEffort(action)).resolves.toBeUndefined();
    expect(mockLoggerError).toHaveBeenCalledWith({ err: "a plain string rejection" }, "bestEffort: a best-effort post-success step failed");
    expect(mockCaptureException).toHaveBeenCalledWith("a plain string rejection");
  });
});
