import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/redis-rate-limit-store", () => ({
  // A minimal in-memory Store, since the real one requires a live Redis
  // client — this test only cares about the configured `limit` actually
  // being enforced, not the Redis-backed storage mechanics (covered by
  // redis-rate-limit-store.test.ts).
  RedisRateLimitStore: class {
    private hits = new Map<string, number>();
    async increment(key: string) {
      const totalHits = (this.hits.get(key) ?? 0) + 1;
      this.hits.set(key, totalHits);
      return { totalHits, resetTime: new Date(Date.now() + 60_000) };
    }
    async decrement() {}
    async resetKey() {}
  },
}));

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe("rate-limit thresholds (Production Hardening Phase 11: env-overridable)", () => {
  it("enforces the default checkout limit (10/min) when RATE_LIMIT_CHECKOUT_PER_MINUTE is unset", async () => {
    delete process.env.RATE_LIMIT_CHECKOUT_PER_MINUTE;
    vi.resetModules();
    const { checkoutRateLimiter } = await import("./rate-limit.js");

    const app = express();
    app.use(checkoutRateLimiter);
    app.get("/", (_req, res) => res.status(200).json({ ok: true }));

    for (let i = 0; i < 10; i++) {
      const res = await request(app).get("/");
      expect(res.status).toBe(200);
    }
    const eleventh = await request(app).get("/");
    expect(eleventh.status).toBe(429);
  });

  it("honors RATE_LIMIT_CHECKOUT_PER_MINUTE when set, allowing a load test to measure real throughput instead of the anti-abuse default", async () => {
    process.env.RATE_LIMIT_CHECKOUT_PER_MINUTE = "2";
    vi.resetModules();
    const { checkoutRateLimiter } = await import("./rate-limit.js");

    const app = express();
    app.use(checkoutRateLimiter);
    app.get("/", (_req, res) => res.status(200).json({ ok: true }));

    expect((await request(app).get("/")).status).toBe(200);
    expect((await request(app).get("/")).status).toBe(200);
    expect((await request(app).get("/")).status).toBe(429);
  });
});
