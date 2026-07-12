import Redis from "ioredis";
import { getOptionalEnv } from "../config/env";
import { createLogger } from "./logger";

const logger = createLogger("redis");

/**
 * Single shared client (Production Hardening Phase 5), mirroring
 * lib/prisma.ts's singleton pattern. `null` when REDIS_URL isn't
 * configured — every caller (redis-rate-limit-store.ts) must treat a null
 * client as "Redis isn't set up here" and degrade accordingly, not throw.
 * This keeps the app fully functional with zero Redis dependency in
 * development/test and any environment that hasn't provisioned it yet.
 *
 * `lazyConnect: true` means the TCP connection isn't opened at import
 * time — it opens on the first command, exactly like every other
 * lib/*.ts singleton in this codebase avoids doing real I/O as an import-
 * time side effect. `maxRetriesPerRequest: 1` and the bounded
 * `retryStrategy` below exist so a command against an unreachable Redis
 * fails fast (a few hundred ms) rather than hanging — the fail-open
 * contract in redis-rate-limit-store.ts depends on failures surfacing
 * quickly, not on ioredis retrying forever in the background.
 */
const redisUrl = getOptionalEnv("REDIS_URL");

export const redis: Redis | null = redisUrl
  ? new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    })
  : null;

if (redis) {
  // ioredis's own default behavior for an unhandled "error" event is to
  // throw and crash the process — every failure here is already handled
  // (fail-open) by whatever called the client, so this listener exists
  // purely to prevent that default and log for observability instead.
  redis.on("error", (err: Error) => {
    logger.error({ err }, "Redis client error (rate limiting fails open)");
  });
}
