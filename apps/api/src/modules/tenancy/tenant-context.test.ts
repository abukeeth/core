import { Role } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { resolveTenantContext, type TenantContextUser } from "./tenant-context";

const owner: TenantContextUser = { id: "user-owner-1", role: Role.RESTAURANT_OWNER };
const staff: TenantContextUser = { id: "user-staff-1", role: Role.RESTAURANT_STAFF };
const admin: TenantContextUser = { id: "user-admin-1", role: Role.ADMIN };

describe("resolveTenantContext", () => {
  it("returns undefined for a public/unauthenticated request (no user)", async () => {
    const ctx = await resolveTenantContext(undefined);
    expect(ctx).toBeUndefined();
  });

  it("resolves an owner's businessId + organizationId from the injected lookups and passes the role through", async () => {
    const getBusinessIdForUser = vi.fn().mockResolvedValue("rest-123");
    const getOrganizationIdForBusiness = vi.fn().mockResolvedValue("org-123");

    const ctx = await resolveTenantContext(owner, { getBusinessIdForUser, getOrganizationIdForBusiness });

    expect(ctx).toBeDefined();
    expect(ctx?.businessId).toBe("rest-123");
    expect(ctx?.organizationId).toBe("org-123");
    expect(ctx?.role).toBe(Role.RESTAURANT_OWNER);
    expect(ctx?.resolvedFrom).toBe("legacy-user-restaurant");
    expect(getBusinessIdForUser).toHaveBeenCalledWith("user-owner-1");
    expect(getOrganizationIdForBusiness).toHaveBeenCalledWith("rest-123");
  });

  it("resolves a staff member's businessId, organizationId, and role identically", async () => {
    const getBusinessIdForUser = vi.fn().mockResolvedValue("rest-456");
    const getOrganizationIdForBusiness = vi.fn().mockResolvedValue("org-456");

    const ctx = await resolveTenantContext(staff, { getBusinessIdForUser, getOrganizationIdForBusiness });

    expect(ctx?.businessId).toBe("rest-456");
    expect(ctx?.organizationId).toBe("org-456");
    expect(ctx?.role).toBe(Role.RESTAURANT_STAFF);
  });

  it("does not attempt an organization lookup when there is no business (owner mid-onboarding)", async () => {
    const getBusinessIdForUser = vi.fn().mockResolvedValue(null);
    const getOrganizationIdForBusiness = vi.fn().mockResolvedValue("org-should-not-be-used");

    const ctx = await resolveTenantContext(owner, { getBusinessIdForUser, getOrganizationIdForBusiness });

    expect(ctx?.businessId).toBeNull();
    expect(ctx?.organizationId).toBeNull();
    expect(ctx?.role).toBe(Role.RESTAURANT_OWNER);
    expect(getOrganizationIdForBusiness).not.toHaveBeenCalled();
  });

  it("resolves organizationId=null when the business has no organization yet", async () => {
    const getBusinessIdForUser = vi.fn().mockResolvedValue("rest-123");
    const getOrganizationIdForBusiness = vi.fn().mockResolvedValue(null);

    const ctx = await resolveTenantContext(owner, { getBusinessIdForUser, getOrganizationIdForBusiness });

    expect(ctx?.businessId).toBe("rest-123");
    expect(ctx?.organizationId).toBeNull();
  });

  it("passes an admin's role through (businessId/organizationId per the lookups, may be null)", async () => {
    const getBusinessIdForUser = vi.fn().mockResolvedValue(null);

    const ctx = await resolveTenantContext(admin, { getBusinessIdForUser });

    expect(ctx?.role).toBe(Role.ADMIN);
    expect(ctx?.businessId).toBeNull();
    expect(ctx?.organizationId).toBeNull();
  });

  it("never throws: a failing business lookup resolves businessId=null (org lookup skipped)", async () => {
    const getBusinessIdForUser = vi.fn().mockRejectedValue(new Error("transient DB error"));
    const getOrganizationIdForBusiness = vi.fn();

    const ctx = await resolveTenantContext(owner, { getBusinessIdForUser, getOrganizationIdForBusiness });

    expect(ctx).toBeDefined();
    expect(ctx?.businessId).toBeNull();
    expect(ctx?.organizationId).toBeNull();
    expect(getOrganizationIdForBusiness).not.toHaveBeenCalled();
  });

  it("never throws: a failing organization lookup resolves organizationId=null but keeps the business", async () => {
    const getBusinessIdForUser = vi.fn().mockResolvedValue("rest-123");
    const getOrganizationIdForBusiness = vi.fn().mockRejectedValue(new Error("transient DB error"));

    const ctx = await resolveTenantContext(owner, { getBusinessIdForUser, getOrganizationIdForBusiness });

    expect(ctx).toBeDefined();
    expect(ctx?.businessId).toBe("rest-123");
    expect(ctx?.organizationId).toBeNull();
    expect(ctx?.role).toBe(Role.RESTAURANT_OWNER);
  });

  it("keeps the not-yet-used slots (locationId/memberships/capabilities) as empty/nullable defaults", async () => {
    const getBusinessIdForUser = vi.fn().mockResolvedValue("rest-123");
    const getOrganizationIdForBusiness = vi.fn().mockResolvedValue("org-123");

    const ctx = await resolveTenantContext(owner, { getBusinessIdForUser, getOrganizationIdForBusiness });

    expect(ctx?.locationId).toBeNull();
    expect(ctx?.memberships).toEqual([]);
    expect(ctx?.capabilities).toEqual({});
  });

  it("reads the business at most once and the organization at most once (no N+1)", async () => {
    const getBusinessIdForUser = vi.fn().mockResolvedValue("rest-123");
    const getOrganizationIdForBusiness = vi.fn().mockResolvedValue("org-123");

    await resolveTenantContext(owner, { getBusinessIdForUser, getOrganizationIdForBusiness });

    expect(getBusinessIdForUser).toHaveBeenCalledTimes(1);
    expect(getOrganizationIdForBusiness).toHaveBeenCalledTimes(1);
  });
});
