import "dotenv/config";
import { assertStartupEnv, getEnv, getSafeEnvSummary } from "./config/env";
import { createApp } from "./app";
import { errorTracker } from "./lib/error-tracker";
import { createLogger } from "./lib/logger";
import { prisma } from "./lib/prisma";
import { redis } from "./lib/redis";
import { startOutboxWorker } from "./modules/commerce/events/outbox-scheduler";
import { startStaleOfferScheduler } from "./modules/commerce/fulfillment/stale-offer-scheduler";
import { startSslIssuanceScheduler } from "./modules/sites/ssl-issuance-scheduler";

const logger = createLogger("index");

// Production Hardening Phase 9 — a process-level uncaughtException/
// unhandledRejection is exactly the case bestEffort()'s in-process
// try/catch cannot protect against ("an in-process try/catch cannot
// protect against the process itself dying," Sprint 07.6/07.7 C-2/C-15/
// H-12): by definition, nothing further up the call stack caught it.
// Logging + reporting it here is the last chance to make it visible
// before Node's default behavior (crash) takes over — intentionally NOT
// caught-and-continued: swallowing an uncaught exception and carrying on
// risks running with corrupted in-process state, which is worse than a
// clean crash-and-restart under an orchestrator's restart policy.
process.on("uncaughtException", (err) => {
  logger.error({ err }, "uncaughtException — process will now exit");
  errorTracker.captureException(err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "unhandledRejection — process will now exit");
  errorTracker.captureException(reason);
  process.exit(1);
});

// Strict startup validation (Production Hardening Phase 3) — fails fast
// with a single aggregated error listing every missing/invalid
// environment variable at once, before app.listen() ever accepts a
// connection. (Note: since this compiles to CommonJS, the static imports
// above are hoisted ahead of this call regardless of source order — some
// of them, e.g. lib/prisma.ts, already validate core config as an import-
// time side effect. This explicit call is the authoritative, well-labeled
// check either way: getEnv() memoizes, so whichever path validates first
// produces the same result.)
assertStartupEnv();

// Safe to log: getSafeEnvSummary() reports only which keys are present,
// never their values — "no secret values can appear in logs" (Phase 3).
logger.info({ env: getSafeEnvSummary() }, "Environment configuration loaded");

const { PORT: port, NODE_ENV: environment } = getEnv();
const app = createApp();

const server = app.listen(port, () => {
  logger.info({ port, environment }, "API server listening");
});

const staleOfferTimer = startStaleOfferScheduler();
const outboxTimer = startOutboxWorker();
const sslIssuanceTimer = startSslIssuanceScheduler();

// Graceful shutdown (Production Hardening Phase 4) — required for a
// zero-downtime rolling deploy: when an orchestrator sends SIGTERM to an
// outgoing instance, stop taking new background-job work immediately, let
// server.close() drain any in-flight HTTP requests to completion (it
// stops accepting new connections but does not cut off existing ones),
// then release the database pool before exiting. A hard exit here (or no
// handler at all, Node's default for SIGTERM) would drop in-flight
// requests and leave connections in the Prisma pool dangling.
let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Signal received, shutting down gracefully");

  clearInterval(staleOfferTimer);
  clearInterval(outboxTimer);
  clearInterval(sslIssuanceTimer);

  server.close((err) => {
    if (err) {
      logger.error({ err }, "Error while closing HTTP server");
    }
    Promise.allSettled([
      prisma.$disconnect().catch((disconnectErr) => {
        logger.error({ err: disconnectErr }, "Error while disconnecting Prisma");
      }),
      // Best-effort — Redis is an optional accelerator (Production
      // Hardening Phase 5), never a shutdown blocker. `redis` is `null`
      // when REDIS_URL isn't configured; `.quit()` itself can still
      // reject (e.g. already disconnected), which must not stop the rest
      // of shutdown either.
      redis?.quit().catch((quitErr) => {
        logger.error({ err: quitErr }, "Error while disconnecting Redis");
      }),
    ]).finally(() => {
      process.exit(err ? 1 : 0);
    });
  });

  // Belt-and-suspenders: if a slow/leaked connection prevents
  // server.close()'s callback from ever firing, force-exit rather than
  // hanging forever and blocking the orchestrator's rollout.
  setTimeout(() => {
    logger.error("Graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
