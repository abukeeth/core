import { MembershipRole, MembershipScope, Role } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "../modules/tenancy/tenant-context";
import { requireRole } from "./require-role";

afterEach(() => {
  delete process.env.MEMBERSHIP_DUAL_READ;
});

function run(req: Partial<Request>): { status: number | null; nexted: boolean } {
  let status: number | null = null;
  const res = {
    status: vi.fn((code: number) => {
      status = code;
      return res;
    }),
    json: vi.fn(() => res),
  } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  requireRole(Role.RESTAURANT_OWNER)(req as Request, res, next);
  return { status, nexted: (next as unknown as ReturnType<typeof vi.fn>).mock.calls.length > 0 };
}

function tenantWith(role: MembershipRole, scopeType: MembershipScope, scopeId: string): TenantContext {
  return {
    businessId: "rest-1",
    organizationId: "org-1",
    role: Role.RESTAURANT_STAFF,
    locationId: null,
    memberships: [
      { id: "mem-1", userId: "u1", role, scopeType, scopeId, createdAt: new Date(), updatedAt: new Date() },
    ] as TenantContext["memberships"],
    capabilities: {},
    resolvedFrom: "legacy-user-restaurant",
  };
}

describe("requireRole", () => {
  it("401 when unauthenticated", () => {
    expect(run({}).status).toBe(401);
  });

  it("legacy path: allows when req.user.role is in the allowed set (unchanged)", () => {
    const { status, nexted } = run({ user: { id: "u1", role: Role.RESTAURANT_OWNER } });
    expect(nexted).toBe(true);
    expect(status).toBeNull();
  });

  it("legacy path: 403 when the role is not allowed and dual-read is OFF", () => {
    // A granting membership is present, but the flag is off → legacy only.
    const { status, nexted } = run({
      user: { id: "u1", role: Role.RESTAURANT_STAFF },
      tenant: tenantWith(MembershipRole.OWNER, MembershipScope.BUSINESS, "rest-1"),
    });
    expect(nexted).toBe(false);
    expect(status).toBe(403);
  });

  it("widen: flag ON + in-scope OWNER membership grants an owner-only route", () => {
    process.env.MEMBERSHIP_DUAL_READ = "true";
    const { status, nexted } = run({
      user: { id: "u1", role: Role.RESTAURANT_STAFF }, // legacy would 403
      tenant: tenantWith(MembershipRole.OWNER, MembershipScope.BUSINESS, "rest-1"),
    });
    expect(nexted).toBe(true);
    expect(status).toBeNull();
  });

  it("widen: flag ON but a STAFF membership does NOT satisfy an owner-only route (403)", () => {
    process.env.MEMBERSHIP_DUAL_READ = "true";
    const { status, nexted } = run({
      user: { id: "u1", role: Role.RESTAURANT_STAFF },
      tenant: tenantWith(MembershipRole.STAFF, MembershipScope.BUSINESS, "rest-1"),
    });
    expect(nexted).toBe(false);
    expect(status).toBe(403);
  });

  it("widen: flag ON but a membership scoped to a different business does not grant (403)", () => {
    process.env.MEMBERSHIP_DUAL_READ = "true";
    const { status, nexted } = run({
      user: { id: "u1", role: Role.RESTAURANT_STAFF },
      tenant: tenantWith(MembershipRole.OWNER, MembershipScope.BUSINESS, "rest-OTHER"),
    });
    expect(nexted).toBe(false);
    expect(status).toBe(403);
  });

  it("widen: flag ON but no req.tenant present → legacy 403 (branch inert)", () => {
    process.env.MEMBERSHIP_DUAL_READ = "true";
    const { status, nexted } = run({ user: { id: "u1", role: Role.RESTAURANT_STAFF } });
    expect(nexted).toBe(false);
    expect(status).toBe(403);
  });

  it("legacy stays authoritative: an allowed role passes regardless of flag/membership", () => {
    process.env.MEMBERSHIP_DUAL_READ = "true";
    const { status, nexted } = run({ user: { id: "u1", role: Role.RESTAURANT_OWNER } });
    expect(nexted).toBe(true);
    expect(status).toBeNull();
  });
});
