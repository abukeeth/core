import { MembershipRole, MembershipScope, Role } from "@prisma/client";
import { describe, expect, it } from "vitest";
import type { TenantContext, TenantMembership } from "../tenancy/tenant-context";
import { membershipGrants, membershipInScope, membershipRoleSatisfies } from "./membership-authz";

function membership(overrides: Partial<TenantMembership> = {}): TenantMembership {
  return {
    id: "mem-1",
    userId: "user-1",
    role: MembershipRole.OWNER,
    scopeType: MembershipScope.BUSINESS,
    scopeId: "rest-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as TenantMembership;
}

function tenant(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    businessId: "rest-1",
    organizationId: "org-1",
    role: Role.RESTAURANT_OWNER,
    locationId: null,
    memberships: [],
    capabilities: {},
    resolvedFrom: "legacy-user-restaurant",
    ...overrides,
  };
}

describe("membershipRoleSatisfies", () => {
  it("maps OWNER → RESTAURANT_OWNER", () => {
    expect(membershipRoleSatisfies(MembershipRole.OWNER, [Role.RESTAURANT_OWNER])).toBe(true);
    expect(membershipRoleSatisfies(MembershipRole.OWNER, [Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF])).toBe(true);
  });

  it("maps STAFF → RESTAURANT_STAFF only (never satisfies an owner-only route)", () => {
    expect(membershipRoleSatisfies(MembershipRole.STAFF, [Role.RESTAURANT_STAFF])).toBe(true);
    expect(membershipRoleSatisfies(MembershipRole.STAFF, [Role.RESTAURANT_OWNER])).toBe(false);
  });

  it("maps ADMIN → ADMIN", () => {
    expect(membershipRoleSatisfies(MembershipRole.ADMIN, [Role.ADMIN])).toBe(true);
    expect(membershipRoleSatisfies(MembershipRole.ADMIN, [Role.RESTAURANT_OWNER])).toBe(false);
  });

  it("grants nothing for roles with no legacy equivalent (MANAGER/KITCHEN/MARKETING/SUPPORT)", () => {
    for (const role of [MembershipRole.MANAGER, MembershipRole.KITCHEN, MembershipRole.MARKETING, MembershipRole.SUPPORT]) {
      expect(membershipRoleSatisfies(role, [Role.RESTAURANT_OWNER, Role.RESTAURANT_STAFF, Role.ADMIN])).toBe(false);
    }
  });
});

describe("membershipInScope", () => {
  it("BUSINESS-scoped membership matches the tenant's businessId", () => {
    expect(membershipInScope(membership({ scopeType: MembershipScope.BUSINESS, scopeId: "rest-1" }), tenant())).toBe(true);
  });

  it("BUSINESS-scoped membership for a different business does not match", () => {
    expect(membershipInScope(membership({ scopeType: MembershipScope.BUSINESS, scopeId: "rest-OTHER" }), tenant())).toBe(false);
  });

  it("ORGANIZATION-scoped membership matches the tenant's organizationId", () => {
    expect(membershipInScope(membership({ scopeType: MembershipScope.ORGANIZATION, scopeId: "org-1" }), tenant())).toBe(true);
  });

  it("does not match when the tenant has no business/org context (null)", () => {
    expect(membershipInScope(membership({ scopeType: MembershipScope.BUSINESS, scopeId: "rest-1" }), tenant({ businessId: null }))).toBe(false);
    expect(membershipInScope(membership({ scopeType: MembershipScope.ORGANIZATION, scopeId: "org-1" }), tenant({ organizationId: null }))).toBe(false);
  });

  it("does not honor LOCATION scope in P2.5", () => {
    expect(membershipInScope(membership({ scopeType: MembershipScope.LOCATION, scopeId: "rest-1" }), tenant())).toBe(false);
  });
});

describe("membershipGrants", () => {
  it("grants when an in-scope OWNER membership maps to an allowed legacy role", () => {
    const t = tenant({ memberships: [membership({ role: MembershipRole.OWNER, scopeType: MembershipScope.BUSINESS, scopeId: "rest-1" })] });
    expect(membershipGrants(t, [Role.RESTAURANT_OWNER])).toBe(true);
  });

  it("grants a STAFF membership on a staff route but NOT on an owner-only route", () => {
    const t = tenant({ memberships: [membership({ role: MembershipRole.STAFF, scopeType: MembershipScope.BUSINESS, scopeId: "rest-1" })] });
    expect(membershipGrants(t, [Role.RESTAURANT_STAFF])).toBe(true);
    expect(membershipGrants(t, [Role.RESTAURANT_OWNER])).toBe(false);
  });

  it("does not grant when the only membership is scoped to a different business", () => {
    const t = tenant({ memberships: [membership({ role: MembershipRole.OWNER, scopeType: MembershipScope.BUSINESS, scopeId: "rest-OTHER" })] });
    expect(membershipGrants(t, [Role.RESTAURANT_OWNER])).toBe(false);
  });

  it("does not grant when there are no memberships", () => {
    expect(membershipGrants(tenant({ memberships: [] }), [Role.RESTAURANT_OWNER])).toBe(false);
  });
});
