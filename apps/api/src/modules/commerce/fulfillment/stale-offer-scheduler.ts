import { getNumberEnv } from "../../../config/env";
import { errorTracker } from "../../../lib/error-tracker";
import { createLogger } from "../../../lib/logger";
import { backgroundJobBatchSize, backgroundJobDurationSeconds } from "../../../lib/metrics";
import { recordWorkerFailure, recordWorkerSuccess } from "../../../lib/worker-health";
import { expireStaleOffers } from "./fulfillment.service";

const SWEEP_INTERVAL_MS = getNumberEnv("DRIVER_OFFER_SWEEP_INTERVAL_MS", 60_000);
const JOB_NAME = "stale_offer_sweep";
const logger = createLogger("stale-offer-scheduler");

/**
 * Process-local interval sweep for stale driver offers (Sprint 07.6 C-11).
 * Sufficient for this codebase's current single-process deployment model —
 * see the C-11 remediation note on revisiting this alongside the event
 * bus's own single-instance limitation if horizontal scaling is introduced.
 * Call once at process startup (index.ts); never import this from app.ts,
 * so tests that build the Express app don't also start a background timer.
 *
 * Production Hardening Phase 9: each sweep's duration and batch size are
 * recorded (lib/metrics.ts), and every successful sweep updates
 * lib/worker-health.ts's `staleOfferSweep` timestamp, so `/health` can
 * report a stuck worker instead of only the logs revealing it after the
 * fact.
 */
export function startStaleOfferScheduler(): NodeJS.Timeout {
  return setInterval(() => {
    const endTimer = backgroundJobDurationSeconds.startTimer({ job: JOB_NAME });
    expireStaleOffers()
      .then(({ expiredCount }) => {
        backgroundJobBatchSize.observe({ job: JOB_NAME }, expiredCount);
        recordWorkerSuccess("staleOfferSweep");
      })
      .catch((err: unknown) => {
        logger.error({ err }, "stale-offer-scheduler: sweep failed");
        errorTracker.captureException(err);
        recordWorkerFailure("staleOfferSweep", err);
      })
      .finally(() => {
        endTimer();
      });
  }, SWEEP_INTERVAL_MS);
}
