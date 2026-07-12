import * as Sentry from "@sentry/node";
import { getEnv, getOptionalEnv } from "../config/env";
import { getRequestContext } from "./logger";

/**
 * Production Hardening Phase 9 — error tracking, swappable exactly like
 * every other optional-infrastructure seam in this codebase
 * (fileStorage/releaseStorage's local-disk-vs-S3 factory, lib/redis.ts's
 * optional client): `SENTRY_DSN` unset means every call here is a no-op,
 * so local development and any environment without a configured tracker
 * behaves identically to before this phase existed — the structured
 * logger (lib/logger.ts) already durably records the same error either
 * way, so a missing tracker is a reduced-observability default, not a
 * functional regression.
 *
 * Closes the residual risk repeatedly noted since Sprint 07.6/07.7 (C-2/
 * C-15/H-12): `bestEffort()`'s in-process try/catch cannot protect
 * against the process itself dying, and error tracking doesn't change
 * that — but it does make every *other* swallowed-but-real failure
 * actually visible to whoever's watching the tracker's dashboard, instead
 * of silently living only in a log file no one is tailing.
 */
export interface ErrorTracker {
  captureException(error: unknown, context?: Record<string, unknown>): void;
}

class NoopErrorTracker implements ErrorTracker {
  captureException(): void {
    // Intentionally does nothing — see module doc comment.
  }
}

class SentryErrorTracker implements ErrorTracker {
  captureException(error: unknown, context?: Record<string, unknown>): void {
    const requestContext = getRequestContext();
    Sentry.captureException(error, {
      tags: {
        requestId: requestContext?.requestId,
        restaurantId: requestContext?.restaurantId,
      },
      extra: context,
    });
  }
}

export function createErrorTracker(): ErrorTracker {
  const dsn = getOptionalEnv("SENTRY_DSN");
  if (!dsn) {
    return new NoopErrorTracker();
  }
  Sentry.init({ dsn, environment: getEnv().NODE_ENV });
  return new SentryErrorTracker();
}

export const errorTracker: ErrorTracker = createErrorTracker();
