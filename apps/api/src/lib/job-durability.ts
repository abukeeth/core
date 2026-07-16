import { getNumberEnv, getOptionalEnv } from "../config/env";

/**
 * §Job Durability (Phase 1) — shared timing/config for the in-process job
 * runners (imports/job-runner.ts, sites/generator.ts) and the reaper
 * (job-reaper.ts). Kept as one module so the heartbeat cadence a running
 * worker uses and the staleness threshold the reaper enforces can never
 * drift out of a safe relationship with each other.
 *
 * All values are env-overridable with conservative defaults. STALE_AFTER
 * is deliberately several minutes — comfortably longer than the longest
 * legitimate single blocking call (an OCR/AI request can block ~60-90s) —
 * so a slow-but-alive job is never mistaken for a dead one.
 */
export const HEARTBEAT_INTERVAL_MS = getNumberEnv("JOB_HEARTBEAT_INTERVAL_MS", 15_000);
export const STALE_AFTER_MS = getNumberEnv("JOB_STALE_AFTER_MS", 180_000);
export const REAPER_INTERVAL_MS = getNumberEnv("JOB_REAPER_INTERVAL_MS", 30_000);
export const MAX_ATTEMPTS = getNumberEnv("JOB_MAX_ATTEMPTS", 3);

/** Reaper runs unless explicitly disabled — set JOB_REAPER_ENABLED="false" to turn it off without a redeploy. */
export function isReaperEnabled(): boolean {
  return getOptionalEnv("JOB_REAPER_ENABLED") !== "false";
}

/** What one reap pass did, per job type — summed across types for metrics/logs. */
export interface ReapResult {
  requeued: number;
  failed: number;
}

/** Everything with liveness older than this instant is presumed abandoned. */
export function staleCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - STALE_AFTER_MS);
}

/**
 * Runs `body` while pinging `beat()` every HEARTBEAT_INTERVAL_MS so the
 * reaper can see the work is still alive. The interval is always cleared,
 * success or failure. `beat` failures are swallowed — a missed heartbeat
 * tick must never take down the actual job (the next tick, or the job
 * finishing, recovers it).
 */
export async function withHeartbeat<T>(beat: () => Promise<void>, body: () => Promise<T>): Promise<T> {
  const timer = setInterval(() => {
    beat().catch(() => undefined);
  }, HEARTBEAT_INTERVAL_MS);
  // Node-only: don't let the heartbeat interval keep the process alive on its own.
  if (typeof timer.unref === "function") timer.unref();
  try {
    return await body();
  } finally {
    clearInterval(timer);
  }
}
