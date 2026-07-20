import { Role } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { resolveTenantContext, type TenantContextUser, type TenantMembership } from "./tenant-context";

const owner: TenantContextUser = { id: "user-owner-1", role: Role.RESTAURANT_OWNER };
const staff: TenantContextUser = { id: "user-staff-1", role: Role.RESTAURANT_STAFF };
const admin: TenantContextUser = { id: "user-admin-1", role: Role.ADMIN };

// A minimal membership record (the resolver treats it opaquely — it just carries
// the lookup's result into req.tenant.memberships).
const ownerOrgMembership = { id: "mem-1", userId: "user-owner-1", role: "OWNER", scopeType: "ORGANIZATION", scopeId: "org-123" } as unknown as TenantMembership;

/** Default DB-free deps: every lookup injected so no test touches Prisma. */
function deps(overrides: Parameters<typeof resolveTenantContext>[1] = {}) {
  return {
    getBusinessIdForUser: vi.fn().mockResolvedValue("rest-123"),
    getOrganizationIdForBusiness: vi.fn().mockResolvedValue("org-123"),
    getMembershipsForUser: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("resolveTenantContext", () => {
  it("returns undefined for a public/unauthenticated request (no user)", async () => {
    const ctx = await resolveTenantContext(undefined);
    expect(ctx).toBeUndefined();
  });

  it("resolves an owner's businessId + organizationId from the injected lookups and passes the role through", async () => {
    const d = deps();

    const ctx = await resolveTenantContext(owner, d);

    expect(ctx).toBeDefined();
    expect(ctx?.businessId).toBe("rest-123");
    expect(ctx?.organizationId).toBe("org-123");
    expect(ctx?.role).toBe(Role.RESTAURANT_OWNER);
    expect(ctx?.resolvedFrom).toBe("legacy-user-restaurant");
    expect(d.getBusinessIdForUser).toHaveBeenCalledWith("user-owner-1");
    expect(d.getOrganizationIdForBusiness).toHaveBeenCalledWith("rest-123");
  });

  it("resolves a staff member's businessId, organizationId, and role identically", async () => {
    const d = deps({
      getBusinessIdForUser: vi.fn().mockResolvedValue("rest-456"),
      getOrganizationIdForBusiness: vi.fn().mockResolvedValue("org-456"),
    });

    const ctx = await resolveTenantContext(staff, d);

    expect(ctx?.businessId).toBe("rest-456");
    expect(ctx?.organizationId).toBe("org-456");
    expect(ctx?.role).toBe(Role.RESTAURANT_STAFF);
  });

  it("does not attempt an organization lookup when there is no business (owner mid-onboarding)", async () => {
    const d = deps({
      getBusinessIdForUser: vi.fn().mockResolvedValue(null),
      getOrganizationIdForBusiness: vi.fn().mockResolvedValue("org-should-not-be-used"),
    });

    const ctx = await resolveTenantContext(owner, d);

    expect(ctx?.businessId).toBeNull();
    expect(ctx?.organizationId).toBeNull();
    expect(ctx?.role).toBe(Role.RESTAURANT_OWNER);
    expect(d.getOrganizationIdForBusiness).not.toHaveBeenCalled();
  });

  it("resolves organizationId=null when the business has no organization yet", async () => {
    const d = deps({ getOrganizationIdForBusiness: vi.fn().mockResolvedValue(null) });

    const ctx = await resolveTenantContext(owner, d);

    expect(ctx?.businessId).toBe("rest-123");
    expect(ctx?.organizationId).toBeNull();
  });

  it("passes an admin's role through (businessId/organizationId per the lookups, may be null)", async () => {
    const d = deps({ getBusinessIdForUser: vi.fn().mockResolvedValue(null) });

    const ctx = await resolveTenantContext(admin, d);

    expect(ctx?.role).toBe(Role.ADMIN);
    expect(ctx?.businessId).toBeNull();
    expect(ctx?.organizationId).toBeNull();
  });

  it("never throws: a failing business lookup resolves businessId=null (org lookup skipped)", async () => {
    const d = deps({
      getBusinessIdForUser: vi.fn().mockRejectedValue(new Error("transient DB error")),
      getOrganizationIdForBusiness: vi.fn(),
    });

    const ctx = await resolveTenantContext(owner, d);

    expect(ctx).toBeDefined();
    expect(ctx?.businessId).toBeNull();
    expect(ctx?.organizationId).toBeNull();
    expect(d.getOrganizationIdForBusiness).not.toHaveBeenCalled();
  });

  it("never throws: a failing organization lookup resolves organizationId=null but keeps the business", async () => {
    const d = deps({ getOrganizationIdForBusiness: vi.fn().mockRejectedValue(new Error("transient DB error")) });

    const ctx = await resolveTenantContext(owner, d);

    expect(ctx).toBeDefined();
    expect(ctx?.businessId).toBe("rest-123");
    expect(ctx?.organizationId).toBeNull();
    expect(ctx?.role).toBe(Role.RESTAURANT_OWNER);
  });

  // --- BOS Phase 2 (P2.4) — membership population ---

  it("populates memberships from the injected lookup, keyed on the user id", async () => {
    const getMembershipsForUser = vi.fn().mockResolvedValue([ownerOrgMembership]);
    const d = deps({ getMembershipsForUser });

    const ctx = await resolveTenantContext(owner, d);

    expect(getMembershipsForUser).toHaveBeenCalledWith("user-owner-1");
    expect(ctx?.memberships).toEqual([ownerOrgMembership]);
  });

  it("resolves memberships for a user with no business (user-scoped, independent of business)", async () => {
    const getMembershipsForUser = vi.fn().mockResolvedValue([ownerOrgMembership]);
    const d = deps({ getBusinessIdForUser: vi.fn().mockResolvedValue(null), getMembershipsForUser });

    const ctx = await resolveTenantContext(owner, d);

    expect(ctx?.businessId).toBeNull();
    expect(ctx?.memberships).toEqual([ownerOrgMembership]);
    expect(getMembershipsForUser).toHaveBeenCalledWith("user-owner-1");
  });

  it("never throws: a failing membership lookup resolves memberships=[] but keeps business/org", async () => {
    const d = deps({ getMembershipsForUser: vi.fn().mockRejectedValue(new Error("transient DB error")) });

    const ctx = await resolveTenantContext(owner, d);

    expect(ctx).toBeDefined();
    expect(ctx?.memberships).toEqual([]);
    expect(ctx?.businessId).toBe("rest-123");
    expect(ctx?.organizationId).toBe("org-123");
  });

  it("keeps the not-yet-used slots (locationId/capabilities) as empty/nullable defaults", async () => {
    const ctx = await resolveTenantContext(owner, deps());

    expect(ctx?.locationId).toBeNull();
    expect(ctx?.capabilities).toEqual({});
    expect(ctx?.memberships).toEqual([]); // populated slot, empty when the user has none
  });

  it("reads the business, organization, and memberships at most once each (no N+1)", async () => {
    const d = deps();

    await resolveTenantContext(owner, d);

    expect(d.getBusinessIdForUser).toHaveBeenCalledTimes(1);
    expect(d.getOrganizationIdForBusiness).toHaveBeenCalledTimes(1);
    expect(d.getMembershipsForUser).toHaveBeenCalledTimes(1);
  });
});
