import { getNumberEnv } from "../../../config/env";
import { errorTracker } from "../../../lib/error-tracker";
import { createLogger } from "../../../lib/logger";
import { backgroundJobBatchSize, backgroundJobDurationSeconds } from "../../../lib/metrics";
import { recordWorkerFailure, recordWorkerSuccess } from "../../../lib/worker-health";
import { dispatchUnacceptedOrderAlerts } from "./unaccepted-order.service";

const SWEEP_INTERVAL_MS = getNumberEnv("KITCHEN_UNACCEPTED_SWEEP_INTERVAL_MS", 15_000);
const JOB_NAME = "unaccepted_order_sweep";
const logger = createLogger("unaccepted-order-scheduler");

/**
 * Process-local interval sweep for the KDS "order not accepted in time"
 * fallback — mirrors startStaleOfferScheduler exactly (metrics, worker-health,
 * error tracking). A 15s cadence means a 60s deadline alerts within ~60–75s.
 * Call once at process startup (index.ts); never import from app.ts, so tests
 * that build the Express app don't also start a background timer.
 */
export function startUnacceptedOrderScheduler(): NodeJS.Timeout {
  return setInterval(() => {
    const endTimer = backgroundJobDurationSeconds.startTimer({ job: JOB_NAME });
    dispatchUnacceptedOrderAlerts()
      .then(({ alertedCount }) => {
        backgroundJobBatchSize.observe({ job: JOB_NAME }, alertedCount);
        recordWorkerSuccess("unacceptedOrderSweep");
      })
      .catch((err: unknown) => {
        logger.error({ err }, "unaccepted-order-scheduler: sweep failed");
        errorTracker.captureException(err);
        recordWorkerFailure("unacceptedOrderSweep", err);
      })
      .finally(() => {
        endTimer();
      });
  }, SWEEP_INTERVAL_MS);
}
