import { afterEach, beforeAll, describe, expect, it } from "vitest";

/**
 * Production Hardening Phase 9 — the first direct integration test
 * against `createApp()` itself (every prior test exercises a service/
 * controller directly, or the compiled server via a real process boot —
 * see the Phase 4/7 completion reports). Sets the core env schema
 * (config/env.ts) before importing anything, since `createApp()` reads
 * `getEnv().FRONTEND_URL` for CORS. No route here touches the database
 * (deliberately not `/ready`, which does), so no live Postgres/Redis is
 * required to run this file.
 */
beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.FRONTEND_URL = "http://localhost:3000";
  process.env.JWT_ACCESS_SECRET = "test-access-secret";
  process.env.JWT_ACCESS_TTL = "15m";
  process.env.JWT_REFRESH_TTL = "30d";
  process.env.COMMERCE_ENCRYPTION_KEY = "0".repeat(64);
});

describe("createApp", () => {
  it(
    "assigns a fresh X-Request-Id to a request that doesn't send one, and echoes an inbound one back unchanged",
    async () => {
      const { createApp } = await import("./app.js");
      const request = (await import("supertest")).default;
      const app = createApp();

      const withoutHeader = await request(app).get("/health");
      expect(withoutHeader.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);

      const withHeader = await request(app).get("/health").set("X-Request-Id", "caller-supplied-id");
      expect(withHeader.headers["x-request-id"]).toBe("caller-supplied-id");
    },
    15_000,
  );

  it("/health reports process liveness plus each background worker's last-poll snapshot (Production Hardening Phase 9)", async () => {
    const { createApp } = await import("./app.js");
    const request = (await import("supertest")).default;
    const app = createApp();

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.workers).toEqual({
      outboxWorker: { lastSuccessAt: null, lastError: null },
      staleOfferSweep: { lastSuccessAt: null, lastError: null },
      sslIssuanceSweep: { lastSuccessAt: null, lastError: null },
    });
  });

  it("/metrics exposes a Prometheus-compatible scrape endpoint, including this request's own latency observation", async () => {
    const { createApp } = await import("./app.js");
    const request = (await import("supertest")).default;
    const app = createApp();

    await request(app).get("/health");
    const res = await request(app).get("/metrics");

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.text).toContain("http_request_duration_seconds");
  });

  describe("CSRF hardening: no urlencoded/form body parsing", () => {
    /**
     * Deliberately does not go through createApp()/supertest here: every
     * route besides /health and /metrics sits behind siteEdgeMiddleware
     * (custom-domain routing), which does a real Prisma lookup on every
     * request and throws without a live database — this file's own
     * top comment notes exactly that constraint. This test instead
     * mirrors app.ts's actual body-parser configuration (express.json()
     * only, no express.urlencoded()) in a minimal standalone Express
     * instance, so the specific parsing behavior is verified without
     * needing a database.
     */
    it("does not populate req.body from a application/x-www-form-urlencoded request, closing the classic form-based CSRF path for cookie-authenticated routes", async () => {
      const express = (await import("express")).default;
      const request = (await import("supertest")).default;
      const app = express();
      app.use(express.json());
      app.post("/probe", (req, res) => {
        res.json({ body: req.body ?? null });
      });

      const formRes = await request(app)
        .post("/probe")
        .set("Content-Type", "application/x-www-form-urlencoded")
        .send("email=attacker%40example.com&password=hunter2");
      expect(formRes.body.body).toBeFalsy();

      const jsonRes = await request(app).post("/probe").send({ email: "a@a.com" });
      expect(jsonRes.body.body).toEqual({ email: "a@a.com" });
    });
  });

  describe("CORS apex/www equivalence", () => {
    const originalFrontendUrl = process.env.FRONTEND_URL;

    afterEach(async () => {
      process.env.FRONTEND_URL = originalFrontendUrl;
      const { __resetEnvCacheForTests } = await import("./config/env.js");
      __resetEnvCacheForTests();
    });

    it("allows both the apex and www origin when FRONTEND_URL is the www host", async () => {
      process.env.FRONTEND_URL = "https://www.ordervora.com";
      const { __resetEnvCacheForTests } = await import("./config/env.js");
      __resetEnvCacheForTests();
      const { createApp } = await import("./app.js");
      const request = (await import("supertest")).default;
      const app = createApp();

      const apex = await request(app).get("/health").set("Origin", "https://ordervora.com");
      const www = await request(app).get("/health").set("Origin", "https://www.ordervora.com");

      expect(apex.headers["access-control-allow-origin"]).toBe("https://ordervora.com");
      expect(www.headers["access-control-allow-origin"]).toBe("https://www.ordervora.com");
    });

    it("rejects an unrelated origin", async () => {
      process.env.FRONTEND_URL = "https://www.ordervora.com";
      const { __resetEnvCacheForTests } = await import("./config/env.js");
      __resetEnvCacheForTests();
      const { createApp } = await import("./app.js");
      const request = (await import("supertest")).default;
      const app = createApp();

      const res = await request(app).get("/health").set("Origin", "https://evil.example.com");

      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });
  });
});
