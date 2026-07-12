import { getNumberEnv } from "../../config/env";
import { errorTracker } from "../../lib/error-tracker";
import { createLogger } from "../../lib/logger";
import { backgroundJobBatchSize, backgroundJobDurationSeconds } from "../../lib/metrics";
import { recordWorkerFailure, recordWorkerSuccess } from "../../lib/worker-health";
import { runSslIssuanceSweep } from "./domain.service";

const SWEEP_INTERVAL_MS = getNumberEnv("SSL_ISSUANCE_SWEEP_INTERVAL_MS", 15_000);
const JOB_NAME = "ssl_issuance_sweep";
const logger = createLogger("ssl-issuance-scheduler");

/**
 * Process-local interval sweep (Sprint 20A Task 4), mirroring
 * stale-offer-scheduler.ts / outbox-scheduler.ts's established pattern:
 * carries domains through GENERATING -> ACTIVE/FAILED and ACTIVE ->
 * EXPIRED (see domain.service.ts's runSslIssuanceSweep for what each pass
 * actually does, and why certificate issuance itself is a documented
 * stub rather than a real ACME/CA call). Call once at process startup
 * (index.ts); never import this from app.ts, so tests that build the
 * Express app don't also start a background timer.
 */
export function startSslIssuanceScheduler(): NodeJS.Timeout {
  return setInterval(() => {
    const endTimer = backgroundJobDurationSeconds.startTimer({ job: JOB_NAME });
    runSslIssuanceSweep()
      .then(({ processedCount }) => {
        backgroundJobBatchSize.observe({ job: JOB_NAME }, processedCount);
        recordWorkerSuccess("sslIssuanceSweep");
      })
      .catch((err: unknown) => {
        logger.error({ err }, "ssl-issuance-scheduler: sweep failed");
        errorTracker.captureException(err);
        recordWorkerFailure("sslIssuanceSweep", err);
      })
      .finally(() => {
        endTimer();
      });
  }, SWEEP_INTERVAL_MS);
}
