import { getNumberEnv } from "../config/env";
import { reapStaleImportJobs } from "../modules/imports/import.service";
import { reapStaleGenerationJobs } from "../modules/sites/generation.service";
import { errorTracker } from "./error-tracker";
import { isReaperEnabled, REAPER_INTERVAL_MS, type ReapResult } from "./job-durability";
import { createLogger } from "./logger";
import { backgroundJobBatchSize, backgroundJobDurationSeconds } from "./metrics";
import { recordWorkerFailure, recordWorkerSuccess } from "./worker-health";

const JOB_NAME = "job_reaper";
const logger = createLogger("job-reaper");

/**
 * §Job Durability (Phase 1) — one pass of the reaper: recover ImportJobs and
 * GenerationJobs abandoned by a dead process (deploy/crash/OOM mid-run) or
 * never claimed, so no import/generation can sit stuck at PROCESSING/RUNNING
 * forever. Pure and independently testable; the scheduler below only wraps
 * it in an interval + observability. Returns the combined counts.
 */
export async function reapStaleJobs(now: Date = new Date()): Promise<ReapResult> {
  const [imports, generations] = await Promise.all([reapStaleImportJobs(now), reapStaleGenerationJobs(now)]);
  return {
    requeued: imports.requeued + generations.requeued,
    failed: imports.failed + generations.failed,
  };
}

/**
 * Process-local interval poll — mirrors outbox-scheduler.ts /
 * stale-offer-scheduler.ts exactly (metrics timer, worker-health liveness,
 * error-tracker on failure). Call once at process startup (index.ts); never
 * import from app.ts so tests building the Express app don't start a timer.
 * Gated by JOB_REAPER_ENABLED so it can be disabled without a redeploy.
 */
export function startJobReaper(): NodeJS.Timeout | null {
  if (!isReaperEnabled()) {
    logger.info("job-reaper disabled via JOB_REAPER_ENABLED=false");
    return null;
  }
  const intervalMs = getNumberEnv("JOB_REAPER_INTERVAL_MS", REAPER_INTERVAL_MS);
  return setInterval(() => {
    const endTimer = backgroundJobDurationSeconds.startTimer({ job: JOB_NAME });
    reapStaleJobs()
      .then(({ requeued, failed }) => {
        backgroundJobBatchSize.observe({ job: JOB_NAME }, requeued + failed);
        if (requeued > 0 || failed > 0) {
          logger.warn({ requeued, failed }, "job-reaper: recovered stale jobs");
        }
        recordWorkerSuccess("jobReaper");
      })
      .catch((err: unknown) => {
        logger.error({ err }, "job-reaper: poll failed");
        errorTracker.captureException(err);
        recordWorkerFailure("jobReaper", err);
      })
      .finally(() => {
        endTimer();
      });
  }, intervalMs);
}
