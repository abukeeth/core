import { getNumberEnv } from "../../../config/env";
import { errorTracker } from "../../../lib/error-tracker";
import { createLogger } from "../../../lib/logger";
import { backgroundJobBatchSize, backgroundJobDurationSeconds } from "../../../lib/metrics";
import { recordWorkerFailure, recordWorkerSuccess } from "../../../lib/worker-health";
import { processOutboxBatch } from "./outbox-worker";

const POLL_INTERVAL_MS = getNumberEnv("OUTBOX_POLL_INTERVAL_MS", 5_000);
const JOB_NAME = "outbox_worker";
const logger = createLogger("outbox-scheduler");

/**
 * Process-local interval poll draining the OutboxEvent table (Sprint 07.7
 * H-11) — mirrors C-11's stale-offer-scheduler.ts pattern. Sufficient for
 * this codebase's current single-process deployment model; see the H-11
 * remediation note on multi-instance claim coordination once horizontal
 * scaling is introduced. Call once at process startup (index.ts); never
 * import this from app.ts, so tests that build the Express app don't also
 * start a background timer.
 *
 * Production Hardening Phase 9: each poll's duration and batch size are
 * recorded (lib/metrics.ts), and every successful poll updates
 * lib/worker-health.ts's `outboxWorker` timestamp, so `/health` can
 * report a stuck worker instead of only the logs revealing it after the
 * fact.
 */
export function startOutboxWorker(): NodeJS.Timeout {
  return setInterval(() => {
    const endTimer = backgroundJobDurationSeconds.startTimer({ job: JOB_NAME });
    processOutboxBatch()
      .then(({ processedCount }) => {
        backgroundJobBatchSize.observe({ job: JOB_NAME }, processedCount);
        recordWorkerSuccess("outboxWorker");
      })
      .catch((err: unknown) => {
        logger.error({ err }, "outbox-scheduler: poll failed");
        errorTracker.captureException(err);
        recordWorkerFailure("outboxWorker", err);
      })
      .finally(() => {
        endTimer();
      });
  }, POLL_INTERVAL_MS);
}
