import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    organization: { create: vi.fn(), findUnique: vi.fn() },
    restaurant: { findUnique: vi.fn() },
  },
}));

import { prisma } from "../../lib/prisma";
import { createOrganization, getOrganizationById, getOrganizationIdForBusiness } from "./organization.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createOrganization", () => {
  it("creates an organization with the given name and owner", async () => {
    const record = { id: "org-1", name: "Joe's Deli", ownerUserId: "user-1" };
    mockPrisma.organization.create.mockResolvedValue(record as never);

    const result = await createOrganization({ name: "Joe's Deli", ownerUserId: "user-1" });

    expect(mockPrisma.organization.create).toHaveBeenCalledWith({
      data: { name: "Joe's Deli", ownerUserId: "user-1" },
    });
    expect(result).toEqual(record);
  });
});

describe("getOrganizationById", () => {
  it("returns the organization when it exists", async () => {
    const record = { id: "org-1", name: "Joe's Deli", ownerUserId: "user-1" };
    mockPrisma.organization.findUnique.mockResolvedValue(record as never);

    await expect(getOrganizationById("org-1")).resolves.toEqual(record);
    expect(mockPrisma.organization.findUnique).toHaveBeenCalledWith({ where: { id: "org-1" } });
  });

  it("returns null when no organization exists for the id", async () => {
    mockPrisma.organization.findUnique.mockResolvedValue(null as never);

    await expect(getOrganizationById("missing")).resolves.toBeNull();
  });
});

describe("getOrganizationIdForBusiness (P1.3 — Tenant Context population)", () => {
  it("returns the business's organizationId when set", async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue({ organizationId: "org-1" } as never);

    await expect(getOrganizationIdForBusiness("rest-1")).resolves.toBe("org-1");
    expect(mockPrisma.restaurant.findUnique).toHaveBeenCalledWith({
      where: { id: "rest-1" },
      select: { organizationId: true },
    });
  });

  it("returns null when the business has no organization yet", async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue({ organizationId: null } as never);

    await expect(getOrganizationIdForBusiness("rest-1")).resolves.toBeNull();
  });

  it("returns null when the business does not exist", async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue(null as never);

    await expect(getOrganizationIdForBusiness("missing")).resolves.toBeNull();
  });
});
