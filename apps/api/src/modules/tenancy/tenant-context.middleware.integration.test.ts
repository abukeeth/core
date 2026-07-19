import { afterEach, beforeAll, describe, expect, it } from "vitest";

/**
 * HTTP-level proof that mounting the Tenant Context middleware in createApp()
 * changes no observable behavior: public routes are unaffected, and a bad or
 * absent token never turns a request into a new error. These assertions target
 * `/health` (registered before siteEdgeMiddleware, so DB-free and deterministic
 * in this no-database test environment). No consumer reads req.tenant (that is
 * P0.3) — this only asserts non-interference. The middleware's never-block
 * guarantee for authenticated/protected requests is proven deterministically in
 * tenant-context.middleware.test.ts, and flag-off inertness is proven by the
 * full existing suite passing unchanged.
 */
beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.FRONTEND_URL = "http://localhost:3000";
  process.env.JWT_ACCESS_SECRET = "test-access-secret";
  process.env.JWT_ACCESS_TTL = "15m";
  process.env.JWT_REFRESH_TTL = "30d";
  process.env.COMMERCE_ENCRYPTION_KEY = "0".repeat(64);
});

afterEach(() => {
  delete process.env.TENANT_CONTEXT_ENABLED;
});

describe("tenantContextMiddleware wired in createApp", () => {
  it("flag OFF: /health responds exactly as before (200)", async () => {
    delete process.env.TENANT_CONTEXT_ENABLED;
    const { createApp } = await import("../../app.js");
    const request = (await import("supertest")).default;
    const app = createApp();

    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("flag ON: public /health still passes through (200), no cookie present", async () => {
    process.env.TENANT_CONTEXT_ENABLED = "true";
    const { createApp } = await import("../../app.js");
    const request = (await import("supertest")).default;
    const app = createApp();

    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("flag ON: a malformed access-token cookie never introduces a new error on a public route (200)", async () => {
    process.env.TENANT_CONTEXT_ENABLED = "true";
    const { createApp } = await import("../../app.js");
    const request = (await import("supertest")).default;
    const app = createApp();

    const res = await request(app).get("/health").set("Cookie", "access_token=garbage-not-a-jwt");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
