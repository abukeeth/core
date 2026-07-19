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

  it("resolves an owner's businessId from the injected lookup and passes the role through", async () => {
    const getBusinessIdForUser = vi.fn().mockResolvedValue("rest-123");

    const ctx = await resolveTenantContext(owner, { getBusinessIdForUser });

    expect(ctx).toBeDefined();
    expect(ctx?.businessId).toBe("rest-123");
    expect(ctx?.role).toBe(Role.RESTAURANT_OWNER);
    expect(ctx?.resolvedFrom).toBe("legacy-user-restaurant");
    expect(getBusinessIdForUser).toHaveBeenCalledWith("user-owner-1");
  });

  it("resolves a staff member's businessId and role identically", async () => {
    const getBusinessIdForUser = vi.fn().mockResolvedValue("rest-456");

    const ctx = await resolveTenantContext(staff, { getBusinessIdForUser });

    expect(ctx?.businessId).toBe("rest-456");
    expect(ctx?.role).toBe(Role.RESTAURANT_STAFF);
  });

  it("resolves businessId=null for a user with no business yet (owner mid-onboarding)", async () => {
    const getBusinessIdForUser = vi.fn().mockResolvedValue(null);

    const ctx = await resolveTenantContext(owner, { getBusinessIdForUser });

    expect(ctx?.businessId).toBeNull();
    expect(ctx?.role).toBe(Role.RESTAURANT_OWNER);
  });

  it("passes an admin's role through (businessId per the lookup, may be null)", async () => {
    const getBusinessIdForUser = vi.fn().mockResolvedValue(null);

    const ctx = await resolveTenantContext(admin, { getBusinessIdForUser });

    expect(ctx?.role).toBe(Role.ADMIN);
    expect(ctx?.businessId).toBeNull();
  });

  it("never throws: a failing lookup resolves businessId=null instead of propagating", async () => {
    const getBusinessIdForUser = vi.fn().mockRejectedValue(new Error("transient DB error"));

    const ctx = await resolveTenantContext(owner, { getBusinessIdForUser });

    expect(ctx).toBeDefined();
    expect(ctx?.businessId).toBeNull();
    expect(ctx?.role).toBe(Role.RESTAURANT_OWNER);
  });

  it("populates the reserved slots as empty/nullable defaults (read by nothing in P0)", async () => {
    const getBusinessIdForUser = vi.fn().mockResolvedValue("rest-123");

    const ctx = await resolveTenantContext(owner, { getBusinessIdForUser });

    expect(ctx?.organizationId).toBeNull();
    expect(ctx?.locationId).toBeNull();
    expect(ctx?.memberships).toEqual([]);
    expect(ctx?.capabilities).toEqual({});
  });

  it("reads the business at most once per call (no N+1)", async () => {
    const getBusinessIdForUser = vi.fn().mockResolvedValue("rest-123");

    await resolveTenantContext(owner, { getBusinessIdForUser });

    expect(getBusinessIdForUser).toHaveBeenCalledTimes(1);
  });
});
