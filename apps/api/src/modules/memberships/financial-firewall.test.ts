import { MembershipRole, MembershipScope, Role } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { TenantContext, TenantMembership } from "../tenancy/tenant-context";
import { evaluateFinancialFirewall, isFinanciallyRestricted } from "./financial-firewall";

function membership(overrides: Partial<TenantMembership> = {}): TenantMembership {
  return {
    id: "mem-1",
    userId: "user-1",
    role: MembershipRole.KITCHEN,
    scopeType: MembershipScope.BUSINESS,
    scopeId: "rest-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as TenantMembership;
}

function tenant(memberships: TenantMembership[], overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    businessId: "rest-1",
    organizationId: "org-1",
    role: Role.RESTAURANT_STAFF,
    locationId: null,
    memberships,
    capabilities: {},
    resolvedFrom: "legacy-user-restaurant",
    ...overrides,
  };
}

describe("isFinanciallyRestricted", () => {
  it("restricts an actor holding an in-scope KITCHEN membership and no money-authorized membership", () => {
    expect(isFinanciallyRestricted(tenant([membership({ role: MembershipRole.KITCHEN })]))).toBe(true);
  });

  it("does not restrict when there is no KITCHEN membership", () => {
    expect(isFinanciallyRestricted(tenant([membership({ role: MembershipRole.STAFF })]))).toBe(false);
    expect(isFinanciallyRestricted(tenant([]))).toBe(false);
  });

  it("does not restrict an OWNER even if they also hold KITCHEN in scope", () => {
    const t = tenant([
      membership({ id: "m1", role: MembershipRole.KITCHEN }),
      membership({ id: "m2", role: MembershipRole.OWNER }),
    ]);
    expect(isFinanciallyRestricted(t)).toBe(false);
  });

  it("does not restrict when a money-authorized membership (MANAGER/STAFF/ADMIN) co-exists in scope", () => {
    for (const role of [MembershipRole.MANAGER, MembershipRole.STAFF, MembershipRole.ADMIN]) {
      const t = tenant([
        membership({ id: "m1", role: MembershipRole.KITCHEN }),
        membership({ id: "m2", role }),
      ]);
      expect(isFinanciallyRestricted(t)).toBe(false);
    }
  });

  it("ignores a KITCHEN membership scoped to a different business (out of scope)", () => {
    const t = tenant([membership({ role: MembershipRole.KITCHEN, scopeType: MembershipScope.BUSINESS, scopeId: "rest-OTHER" })]);
    expect(isFinanciallyRestricted(t)).toBe(false);
  });

  it("honors an ORGANIZATION-scoped KITCHEN membership matching the tenant org", () => {
    const t = tenant([membership({ role: MembershipRole.KITCHEN, scopeType: MembershipScope.ORGANIZATION, scopeId: "org-1" })]);
    expect(isFinanciallyRestricted(t)).toBe(true);
  });

  it("a money-authorized membership in a DIFFERENT business does not rescue a KITCHEN actor in this one", () => {
    const t = tenant([
      membership({ id: "m1", role: MembershipRole.KITCHEN, scopeId: "rest-1" }),
      membership({ id: "m2", role: MembershipRole.STAFF, scopeId: "rest-OTHER" }),
    ]);
    expect(isFinanciallyRestricted(t)).toBe(true);
  });
});

describe("evaluateFinancialFirewall (flag × predicate)", () => {
  const kitchen = tenant([membership({ role: MembershipRole.KITCHEN })]);
  const owner = tenant([membership({ role: MembershipRole.OWNER })]);

  it("returns \"allow\" when the flag is off, regardless of the actor", () => {
    expect(evaluateFinancialFirewall(kitchen, "off")).toBe("allow");
  });

  it("returns \"allow\" when there is no tenant (context flag off / unauthenticated)", () => {
    expect(evaluateFinancialFirewall(undefined, "enforce")).toBe("allow");
  });

  it("returns \"allow\" for a non-restricted actor even in enforce mode", () => {
    expect(evaluateFinancialFirewall(owner, "enforce")).toBe("allow");
  });

  it("returns \"observe\" for a restricted actor in observe mode (no reduction)", () => {
    expect(evaluateFinancialFirewall(kitchen, "observe")).toBe("observe");
  });

  it("returns \"enforce\" for a restricted actor in enforce mode", () => {
    expect(evaluateFinancialFirewall(kitchen, "enforce")).toBe("enforce");
  });
});
