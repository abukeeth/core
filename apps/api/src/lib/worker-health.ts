/**
 * Production Hardening Phase 9 — tracks each background worker's last
 * successful poll, so a stuck worker (e.g. wedged on a bad row it can
 * never process, or a Postgres connection that silently died) is
 * externally observable via `/health` rather than only discoverable by
 * reading logs after the fact (master spec Phase 9 item 6). Deliberately
 * a plain in-memory module, not persisted: this is a single-process
 * liveness signal for the process's own /health check, not a durability
 * mechanism — the underlying work itself (OutboxEvent rows, stale driver
 * offers) is already durable in Postgres regardless of this module.
 */
export const WORKER_NAMES = ["outboxWorker", "staleOfferSweep", "sslIssuanceSweep"] as const;
export type WorkerName = (typeof WORKER_NAMES)[number];

interface WorkerPollState {
  lastSuccessAt: Date | null;
  lastError: string | null;
}

function initialState(): Record<WorkerName, WorkerPollState> {
  return {
    outboxWorker: { lastSuccessAt: null, lastError: null },
    staleOfferSweep: { lastSuccessAt: null, lastError: null },
    sslIssuanceSweep: { lastSuccessAt: null, lastError: null },
  };
}

let state = initialState();

export function recordWorkerSuccess(worker: WorkerName): void {
  state[worker] = { lastSuccessAt: new Date(), lastError: null };
}

export function recordWorkerFailure(worker: WorkerName, error: unknown): void {
  state[worker] = {
    lastSuccessAt: state[worker].lastSuccessAt,
    lastError: error instanceof Error ? error.message : String(error),
  };
}

export interface WorkerHealthSnapshot {
  lastSuccessAt: string | null;
  lastError: string | null;
}

/** Read-only snapshot for /health — ISO timestamps (or null if the worker has never completed a poll since this process started), never a live Date reference. */
export function getWorkerHealthSnapshot(): Record<WorkerName, WorkerHealthSnapshot> {
  const snapshot = {} as Record<WorkerName, WorkerHealthSnapshot>;
  for (const worker of WORKER_NAMES) {
    snapshot[worker] = {
      lastSuccessAt: state[worker].lastSuccessAt?.toISOString() ?? null,
      lastError: state[worker].lastError,
    };
  }
  return snapshot;
}

/** Test-only: resets in-memory worker state between tests. Never call from application code. */
export function __resetWorkerHealthForTests(): void {
  state = initialState();
}
