import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RedisRateLimitStore as RedisRateLimitStoreType } from "./redis-rate-limit-store.js";

const ORIGINAL_REDIS_URL = process.env.REDIS_URL;

afterEach(() => {
  if (ORIGINAL_REDIS_URL === undefined) {
    delete process.env.REDIS_URL;
  } else {
    process.env.REDIS_URL = ORIGINAL_REDIS_URL;
  }
  vi.resetModules();
  vi.doUnmock("./redis");
});

describe("RedisRateLimitStore — Redis not configured (REDIS_URL unset)", () => {
  async function freshStore(prefix: string): Promise<RedisRateLimitStoreType> {
    delete process.env.REDIS_URL;
    vi.resetModules();
    const { redis } = await import("./redis.js");
    expect(redis).toBeNull();
    const { RedisRateLimitStore } = await import("./redis-rate-limit-store.js");
    return new RedisRateLimitStore(prefix);
  }

  it("increment always fails open (fresh single hit, no resetTime)", async () => {
    const store = await freshStore("test-unconfigured");
    const result = await store.increment("client-a");
    expect(result).toEqual({ totalHits: 1, resetTime: undefined });
    // Repeated calls stay fail-open — never accumulates toward a limit.
    const second = await store.increment("client-a");
    expect(second).toEqual({ totalHits: 1, resetTime: undefined });
  });

  it("decrement and resetKey resolve without throwing", async () => {
    const store = await freshStore("test-unconfigured");
    await expect(store.decrement("client-a")).resolves.toBeUndefined();
    await expect(store.resetKey("client-a")).resolves.toBeUndefined();
  });
});

describe("RedisRateLimitStore — Redis configured but every command throws", () => {
  async function freshThrowingStore(prefix: string): Promise<RedisRateLimitStoreType> {
    process.env.REDIS_URL = "redis://localhost:6379";
    vi.resetModules();
    vi.doMock("./redis", () => ({
      redis: {
        multi: () => {
          throw new Error("simulated Redis outage");
        },
        pexpire: vi.fn().mockRejectedValue(new Error("simulated Redis outage")),
        decr: vi.fn().mockRejectedValue(new Error("simulated Redis outage")),
        del: vi.fn().mockRejectedValue(new Error("simulated Redis outage")),
      },
    }));
    const { RedisRateLimitStore } = await import("./redis-rate-limit-store.js");
    return new RedisRateLimitStore(prefix);
  }

  it("increment fails open rather than rejecting or throwing", async () => {
    const store = await freshThrowingStore("test-throwing");
    const result = await store.increment("client-b");
    expect(result).toEqual({ totalHits: 1, resetTime: undefined });
  });

  it("decrement and resetKey swallow the error rather than rejecting", async () => {
    const store = await freshThrowingStore("test-throwing");
    await expect(store.decrement("client-b")).resolves.toBeUndefined();
    await expect(store.resetKey("client-b")).resolves.toBeUndefined();
  });
});

describe("RedisRateLimitStore — real Redis (behavioral correctness)", () => {
  let skip = false;

  beforeEach(async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    vi.resetModules();
    const { redis } = await import("./redis.js");
    if (!redis) {
      skip = true;
      return;
    }
    try {
      await redis.ping();
    } catch {
      skip = true;
    }
  });

  afterAll(async () => {
    vi.resetModules();
    process.env.REDIS_URL = "redis://localhost:6379";
    const { redis } = await import("./redis.js");
    await redis?.quit();
  });

  it("first increment for a key returns totalHits 1 with a resetTime", async () => {
    if (skip) return;
    const { RedisRateLimitStore } = await import("./redis-rate-limit-store.js");
    const store = new RedisRateLimitStore(`test-real-${Date.now()}-a`);
    const key = `client-${Date.now()}`;
    const result = await store.increment(key);
    expect(result.totalHits).toBe(1);
    expect(result.resetTime).toBeInstanceOf(Date);
    await store.resetKey(key);
  });

  it("increments accumulate for the same key within the window", async () => {
    if (skip) return;
    const { RedisRateLimitStore } = await import("./redis-rate-limit-store.js");
    const store = new RedisRateLimitStore(`test-real-${Date.now()}-b`);
    const key = `client-${Date.now()}`;
    await store.increment(key);
    await store.increment(key);
    const third = await store.increment(key);
    expect(third.totalHits).toBe(3);
    await store.resetKey(key);
  });

  it("resetKey brings the counter back to a fresh state", async () => {
    if (skip) return;
    const { RedisRateLimitStore } = await import("./redis-rate-limit-store.js");
    const store = new RedisRateLimitStore(`test-real-${Date.now()}-c`);
    const key = `client-${Date.now()}`;
    await store.increment(key);
    await store.increment(key);
    await store.resetKey(key);
    const afterReset = await store.increment(key);
    expect(afterReset.totalHits).toBe(1);
    await store.resetKey(key);
  });

  it("decrement reduces the counter", async () => {
    if (skip) return;
    const { RedisRateLimitStore } = await import("./redis-rate-limit-store.js");
    const store = new RedisRateLimitStore(`test-real-${Date.now()}-d`);
    const key = `client-${Date.now()}`;
    await store.increment(key);
    await store.increment(key);
    await store.decrement(key);
    const result = await store.increment(key);
    expect(result.totalHits).toBe(2);
    await store.resetKey(key);
  });

  it("two limiters (different prefixes) never share counts for the same raw key", async () => {
    if (skip) return;
    const { RedisRateLimitStore } = await import("./redis-rate-limit-store.js");
    const sharedKey = `client-${Date.now()}`;
    const storeA = new RedisRateLimitStore(`test-real-${Date.now()}-e1`);
    const storeB = new RedisRateLimitStore(`test-real-${Date.now()}-e2`);
    await storeA.increment(sharedKey);
    await storeA.increment(sharedKey);
    const bResult = await storeB.increment(sharedKey);
    expect(bResult.totalHits).toBe(1);
    await storeA.resetKey(sharedKey);
    await storeB.resetKey(sharedKey);
  });
});
