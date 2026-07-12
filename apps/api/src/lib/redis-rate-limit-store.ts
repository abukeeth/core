import type { IncrementResponse, Options, Store } from "express-rate-limit";
import { createLogger } from "./logger";
import { redis } from "./redis";

const logger = createLogger("redis-rate-limit-store");

/** Returned by every method on any failure path (Redis unconfigured or
 * unreachable) — a fresh single hit that's never close to a real limit,
 * i.e. "allow this request, don't enforce" (Production Hardening Phase 5
 * spec item 4: "a rate-limiter outage must never itself become a
 * checkout-blocking outage"). */
const FAIL_OPEN_RESPONSE: IncrementResponse = { totalHits: 1, resetTime: undefined };

/**
 * A minimal express-rate-limit Store backed by the shared Redis client
 * (lib/redis.ts) — hand-written rather than reaching for the
 * `rate-limit-redis` package specifically so the fail-open contract is
 * explicit and directly unit-testable here, not an incidental side effect
 * of a third-party library's own error-propagation behavior. By default,
 * express-rate-limit surfaces a thrown/rejected Store method as a 500 to
 * the caller — that would turn a Redis blip into a hard outage for every
 * rate-limited route (including checkout), exactly what this phase
 * prohibits. Every method here catches its own errors and degrades to
 * FAIL_OPEN_RESPONSE / a no-op instead.
 *
 * Falls back to this same fail-open behavior when `redis` is `null` (Redis
 * isn't configured at all) — one code path handles both "no Redis here"
 * and "Redis is configured but unreachable right now," so a limiter
 * doesn't need its own branch for each case.
 *
 * Implements a standard fixed-window counter (INCR + PEXPIRE on first
 * hit), keyed with a per-limiter prefix so two different limiters sharing
 * the same underlying key (e.g. both keyed by IP) never collide in Redis.
 */
export class RedisRateLimitStore implements Store {
  // Deliberately not `private` — TypeScript's structural compatibility
  // check against express-rate-limit's `Store | LegacyStore | undefined`
  // union treats a class with any private member as incompatible with a
  // plain object type in that union, which is a TS quirk, not a real
  // encapsulation concern for a small internal-only class like this one.
  readonly prefix: string;
  windowMs = 60_000;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private key(key: string): string {
    return `ratelimit:${this.prefix}:${key}`;
  }

  async increment(key: string): Promise<IncrementResponse> {
    if (!redis) {
      return FAIL_OPEN_RESPONSE;
    }
    try {
      const redisKey = this.key(key);
      const results = await redis.multi().incr(redisKey).pttl(redisKey).exec();
      if (!results) {
        return FAIL_OPEN_RESPONSE;
      }

      const [[incrErr, totalHits], [pttlErr, pttl]] = results as [[Error | null, number], [Error | null, number]];
      if (incrErr || pttlErr) {
        return FAIL_OPEN_RESPONSE;
      }

      // First hit in this window, or the key somehow has no TTL (e.g. a
      // Redis restart that lost volatile keys' expiry without losing the
      // key itself) — (re-)arm the window's expiry now.
      if (totalHits === 1 || pttl < 0) {
        await redis.pexpire(redisKey, this.windowMs);
        return { totalHits, resetTime: new Date(Date.now() + this.windowMs) };
      }

      return { totalHits, resetTime: new Date(Date.now() + pttl) };
    } catch (err) {
      logger.error({ err, prefix: this.prefix }, "RedisRateLimitStore: increment failed, failing open");
      return FAIL_OPEN_RESPONSE;
    }
  }

  async decrement(key: string): Promise<void> {
    if (!redis) return;
    try {
      await redis.decr(this.key(key));
    } catch (err) {
      logger.error({ err, prefix: this.prefix }, "RedisRateLimitStore: decrement failed");
    }
  }

  async resetKey(key: string): Promise<void> {
    if (!redis) return;
    try {
      await redis.del(this.key(key));
    } catch (err) {
      logger.error({ err, prefix: this.prefix }, "RedisRateLimitStore: resetKey failed");
    }
  }
}
