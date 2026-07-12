import { beforeEach, describe, expect, it } from "vitest";
import { __resetWorkerHealthForTests, getWorkerHealthSnapshot, recordWorkerFailure, recordWorkerSuccess } from "./worker-health";

beforeEach(() => {
  __resetWorkerHealthForTests();
});

describe("worker-health", () => {
  it("reports null lastSuccessAt/lastError for a worker that has never polled", () => {
    const snapshot = getWorkerHealthSnapshot();
    expect(snapshot.outboxWorker).toEqual({ lastSuccessAt: null, lastError: null });
    expect(snapshot.staleOfferSweep).toEqual({ lastSuccessAt: null, lastError: null });
  });

  it("records a successful poll as an ISO timestamp and clears any prior error", () => {
    recordWorkerFailure("outboxWorker", new Error("db down"));
    recordWorkerSuccess("outboxWorker");

    const snapshot = getWorkerHealthSnapshot().outboxWorker;
    expect(snapshot.lastError).toBeNull();
    expect(snapshot.lastSuccessAt).not.toBeNull();
    expect(new Date(snapshot.lastSuccessAt!).toString()).not.toBe("Invalid Date");
  });

  it("records a failure without clearing the last known-good success timestamp", () => {
    recordWorkerSuccess("staleOfferSweep");
    const lastSuccessAt = getWorkerHealthSnapshot().staleOfferSweep.lastSuccessAt;

    recordWorkerFailure("staleOfferSweep", new Error("sweep failed"));

    const snapshot = getWorkerHealthSnapshot().staleOfferSweep;
    expect(snapshot.lastSuccessAt).toBe(lastSuccessAt);
    expect(snapshot.lastError).toBe("sweep failed");
  });

  it("stringifies a non-Error failure rather than throwing", () => {
    recordWorkerFailure("outboxWorker", "a plain string rejection");
    expect(getWorkerHealthSnapshot().outboxWorker.lastError).toBe("a plain string rejection");
  });

  it("tracks each worker independently", () => {
    recordWorkerSuccess("outboxWorker");
    const snapshot = getWorkerHealthSnapshot();
    expect(snapshot.outboxWorker.lastSuccessAt).not.toBeNull();
    expect(snapshot.staleOfferSweep.lastSuccessAt).toBeNull();
  });
});
