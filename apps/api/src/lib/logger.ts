import { AsyncLocalStorage } from "node:async_hooks";
import pino from "pino";
import { getOptionalEnv } from "../config/env";

/**
 * Production Hardening Phase 9 — structured logging, replacing every
 * `console.error`/`console.log`/`console.debug`/`console.warn` call site
 * across apps/api/src. `pino` chosen per the master spec: low overhead
 * (this app's hot path, checkout, cannot afford a synchronous/blocking
 * logger), native JSON output (what any real log aggregator expects).
 *
 * Request correlation: a request ID (and, once auth/tenant resolution
 * happens, a restaurantId) is stored in an AsyncLocalStorage context by
 * app.ts's correlation middleware and automatically merged into every log
 * line for the lifetime of that request/async chain via pino's `mixin`
 * hook — including logs from code invoked deep inside a request handler
 * (a bestEffort() failure, a service call, an event-bus handler) without
 * every one of those call sites needing to manually thread requestId
 * through their own function signatures.
 */

export interface RequestContext {
  requestId: string;
  restaurantId?: string;
}

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` with `context` available to every log call (via mixin) and to `getRequestContext()`/`setRequestRestaurantId()` for the duration of the call, including anything it awaits. */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return requestContextStorage.run(context, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

/** Lets a handler attach the restaurantId once it's known (e.g. after requireAuth resolves the caller), without needing to re-enter runWithRequestContext partway through an already-running request. */
export function setRequestRestaurantId(restaurantId: string): void {
  const context = requestContextStorage.getStore();
  if (context) {
    context.restaurantId = restaurantId;
  }
}

// Defaults to silent under `NODE_ENV=test`: this codebase's test suite
// deliberately exercises many real error/fail-open paths (bestEffort(),
// the outbox worker's dispatch failures, RedisRateLimitStore's fail-open
// branches), and pino writes straight to stdout rather than through
// `console.*`, so it isn't caught by any test's own console spies —
// without this default, running the suite would be extremely noisy.
// `LOG_LEVEL` always wins when explicitly set, including in tests, for
// a developer who deliberately wants to see log output while debugging.
const DEFAULT_LEVEL = getOptionalEnv("NODE_ENV") === "test" ? "silent" : "info";

const baseLogger = pino({
  level: getOptionalEnv("LOG_LEVEL") ?? DEFAULT_LEVEL,
  // `console.debug` call sites (e.g. the commerce event bus's debug
  // subscriber) map to pino's "debug" level, one below the "info" default
  // — unchanged verbosity by default, opt-in via LOG_LEVEL=debug.
  mixin() {
    return getRequestContext() ?? {};
  },
});

/** One child logger per module, tagging every line with `module` — mirrors this codebase's existing per-concern-file convention (one file per responsibility) rather than one undifferentiated global logger. */
export function createLogger(moduleName: string) {
  return baseLogger.child({ module: moduleName });
}

export type Logger = ReturnType<typeof createLogger>;
