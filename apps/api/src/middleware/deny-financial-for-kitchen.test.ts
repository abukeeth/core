import { MembershipRole, MembershipScope, Role } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "../modules/tenancy/tenant-context";
import { denyFinancialForKitchen } from "./deny-financial-for-kitchen";

afterEach(() => {
  delete process.env.KITCHEN_FIREWALL;
});

function tenantWith(role: MembershipRole): TenantContext {
  return {
    businessId: "rest-1",
    organizationId: "org-1",
    role: Role.RESTAURANT_STAFF,
    locationId: null,
    memberships: [
      { id: "m1", userId: "u1", role, scopeType: MembershipScope.BUSINESS, scopeId: "rest-1", createdAt: new Date(), updatedAt: new Date() },
    ] as TenantContext["memberships"],
    capabilities: {},
    resolvedFrom: "legacy-user-restaurant",
  };
}

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
  denyFinancialForKitchen({ user: { id: "u1", role: Role.RESTAURANT_STAFF }, method: "GET", originalUrl: "/x", ...req } as Request, res, next);
  return { status, nexted: (next as unknown as ReturnType<typeof vi.fn>).mock.calls.length > 0 };
}

describe("denyFinancialForKitchen", () => {
  it("flag off (default): allows a kitchen actor through (inert)", () => {
    const { status, nexted } = run({ tenant: tenantWith(MembershipRole.KITCHEN) });
    expect(nexted).toBe(true);
    expect(status).toBeNull();
  });

  it("observe: allows a kitchen actor through without reducing access", () => {
    process.env.KITCHEN_FIREWALL = "observe";
    const { status, nexted } = run({ tenant: tenantWith(MembershipRole.KITCHEN) });
    expect(nexted).toBe(true);
    expect(status).toBeNull();
  });

  it("enforce: denies a kitchen actor with 403", () => {
    process.env.KITCHEN_FIREWALL = "enforce";
    const { status, nexted } = run({ tenant: tenantWith(MembershipRole.KITCHEN) });
    expect(nexted).toBe(false);
    expect(status).toBe(403);
  });

  it("enforce: does NOT deny an owner (money-authorized) — passes through", () => {
    process.env.KITCHEN_FIREWALL = "enforce";
    const { status, nexted } = run({ tenant: tenantWith(MembershipRole.OWNER) });
    expect(nexted).toBe(true);
    expect(status).toBeNull();
  });

  it("enforce: inert when no tenant is present (context flag off)", () => {
    process.env.KITCHEN_FIREWALL = "enforce";
    const { status, nexted } = run({});
    expect(nexted).toBe(true);
    expect(status).toBeNull();
  });
});
