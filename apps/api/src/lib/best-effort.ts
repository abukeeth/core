import { errorTracker } from "./error-tracker";
import { createLogger } from "./logger";

const logger = createLogger("best-effort");

/**
 * Runs a side effect without ever letting it throw to the caller — used
 * once a money-moving or state-changing operation has already
 * irrevocably succeeded, so a downstream failure (a notification send, an
 * event write, a non-critical state transition) can never cause the
 * caller to throw and trigger an idempotency-key retry against work
 * that's already done (Sprint 07.6 C-2/C-15, Sprint 07.7 H-12). Shared
 * across checkout.service.ts and orders.service.ts so this pattern has a
 * single implementation, reducing the chance the same mistake gets
 * reintroduced at a future call site.
 *
 * Production Hardening Phase 9: the swallow-and-log contract is
 * unchanged, but the log is now structured (searchable by `module`) and
 * every swallowed failure is also forwarded to the error tracker — the
 * whole point of `bestEffort()` is that these failures are real and
 * worth seeing, just never worth failing the request over.
 */
export async function bestEffort(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (err) {
    logger.error({ err }, "bestEffort: a best-effort post-success step failed");
    errorTracker.captureException(err);
  }
}
