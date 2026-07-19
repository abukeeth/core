import { Role } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Mock only the business-id lookup so the middleware + real resolver can run
// without a database. Everything else (JWT sign/verify, the resolver, the flag)
// is exercised for real. vi.hoisted so the mock fn exists before vi.mock runs.
const { getOwnRestaurantId } = vi.hoisted(() => ({ getOwnRestaurantId: vi.fn() }));
vi.mock("../restaurants/restaurant.service", () => ({ getOwnRestaurantId }));

import { __resetEnvCacheForTests } from "../../config/env";
import { signAccessToken } from "../../lib/jwt";
import { ACCESS_TOKEN_COOKIE } from "../auth/cookies";
import type { TenantContext } from "./tenant-context";
import { tenantContextMiddleware } from "./tenant-context.middleware";

beforeAll(() => {
  process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
  process.env.FRONTEND_URL = "http://localhost:3000";
  process.env.JWT_ACCESS_SECRET = "test-access-secret";
  process.env.JWT_ACCESS_TTL = "15m";
  process.env.JWT_REFRESH_TTL = "30d";
  process.env.COMMERCE_ENCRYPTION_KEY = "0".repeat(64);
  __resetEnvCacheForTests();
});

afterEach(() => {
  getOwnRestaurantId.mockReset();
  delete process.env.TENANT_CONTEXT_ENABLED;
});

function enableFlag() {
  process.env.TENANT_CONTEXT_ENABLED = "true";
}

function tokenFor(id: string, role: Role): Record<string, string> {
  return { [ACCESS_TOKEN_COOKIE]: signAccessToken({ sub: id, role }) };
}

async function invoke(
  cookies: Record<string, string> = {},
  existingTenant?: TenantContext,
): Promise<{ req: Request & { tenant?: TenantContext }; next: ReturnType<typeof vi.fn> }> {
  const req = { cookies } as unknown as Request & { tenant?: TenantContext };
  if (existingTenant) req.tenant = existingTenant;
  const res = {} as Response;
  const next = vi.fn();
  await tenantContextMiddleware(req, res, next as unknown as NextFunction);
  return { req, next };
}

describe("tenantContextMiddleware", () => {
  it("flag OFF: passes through, never sets req.tenant, never touches the lookup", async () => {
    // TENANT_CONTEXT_ENABLED unset → off
    const { req, next } = await invoke(tokenFor("user-1", Role.RESTAURANT_OWNER));

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.tenant).toBeUndefined();
    expect(getOwnRestaurantId).not.toHaveBeenCalled();
  });

  it("flag ON, no cookie: passes through with no req.tenant (public/unauthenticated)", async () => {
    enableFlag();
    const { req, next } = await invoke({});

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.tenant).toBeUndefined();
    expect(getOwnRestaurantId).not.toHaveBeenCalled();
  });

  it("flag ON, invalid token: passes through with no req.tenant and never throws", async () => {
    enableFlag();
    const { req, next } = await invoke({ [ACCESS_TOKEN_COOKIE]: "not-a-valid-jwt" });

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.tenant).toBeUndefined();
    expect(getOwnRestaurantId).not.toHaveBeenCalled();
  });

  it("flag ON, valid OWNER token: attaches req.tenant with businessId === getOwnRestaurantId result", async () => {
    enableFlag();
    getOwnRestaurantId.mockResolvedValue("rest-1");

    const { req, next } = await invoke(tokenFor("user-owner", Role.RESTAURANT_OWNER));

    expect(getOwnRestaurantId).toHaveBeenCalledWith("user-owner");
    expect(req.tenant?.businessId).toBe("rest-1");
    expect(req.tenant?.role).toBe(Role.RESTAURANT_OWNER);
    expect(req.tenant?.resolvedFrom).toBe("legacy-user-restaurant");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("flag ON, valid STAFF token: businessId and role resolve identically", async () => {
    enableFlag();
    getOwnRestaurantId.mockResolvedValue("rest-2");

    const { req } = await invoke(tokenFor("user-staff", Role.RESTAURANT_STAFF));

    expect(req.tenant?.businessId).toBe("rest-2");
    expect(req.tenant?.role).toBe(Role.RESTAURANT_STAFF);
  });

  it("flag ON, valid ADMIN token with no owned restaurant: role passes through, businessId null", async () => {
    enableFlag();
    getOwnRestaurantId.mockResolvedValue(null);

    const { req } = await invoke(tokenFor("user-admin", Role.ADMIN));

    expect(req.tenant?.role).toBe(Role.ADMIN);
    expect(req.tenant?.businessId).toBeNull();
  });

  it("flag ON, owner mid-onboarding (lookup returns null): businessId null, still resolves, no throw", async () => {
    enableFlag();
    getOwnRestaurantId.mockResolvedValue(null);

    const { req, next } = await invoke(tokenFor("user-new-owner", Role.RESTAURANT_OWNER));

    expect(req.tenant).toBeDefined();
    expect(req.tenant?.businessId).toBeNull();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("flag ON, resolution failure (lookup rejects): request still proceeds, never throws", async () => {
    enableFlag();
    getOwnRestaurantId.mockRejectedValue(new Error("transient DB error"));

    const { req, next } = await invoke(tokenFor("user-owner", Role.RESTAURANT_OWNER));

    // The resolver swallows the failure (businessId null); the middleware calls next() regardless.
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.tenant?.businessId).toBeNull();
  });

  it("flag ON: does not overwrite an already-present req.tenant", async () => {
    enableFlag();
    getOwnRestaurantId.mockResolvedValue("rest-should-not-be-used");
    const preset: TenantContext = {
      businessId: "preset-business",
      role: Role.RESTAURANT_OWNER,
      organizationId: null,
      locationId: null,
      memberships: [],
      capabilities: {},
      resolvedFrom: "legacy-user-restaurant",
    };

    const { req } = await invoke(tokenFor("user-owner", Role.RESTAURANT_OWNER), preset);

    expect(req.tenant?.businessId).toBe("preset-business");
    expect(getOwnRestaurantId).not.toHaveBeenCalled();
  });
});
