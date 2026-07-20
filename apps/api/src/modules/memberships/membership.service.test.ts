import { MembershipRole, MembershipScope } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    membership: { create: vi.fn(), findMany: vi.fn() },
  },
}));

import { prisma } from "../../lib/prisma";
import { createMembership, getMembershipsForUser } from "./membership.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createMembership", () => {
  it("creates a scoped role grant with the given user, role, and scope", async () => {
    const record = {
      id: "mem-1",
      userId: "user-1",
      role: MembershipRole.OWNER,
      scopeType: MembershipScope.ORGANIZATION,
      scopeId: "org-1",
    };
    mockPrisma.membership.create.mockResolvedValue(record as never);

    const result = await createMembership({
      userId: "user-1",
      role: MembershipRole.OWNER,
      scopeType: MembershipScope.ORGANIZATION,
      scopeId: "org-1",
    });

    expect(mockPrisma.membership.create).toHaveBeenCalledWith({
      data: { userId: "user-1", role: MembershipRole.OWNER, scopeType: MembershipScope.ORGANIZATION, scopeId: "org-1" },
    });
    expect(result).toEqual(record);
  });

  it("supports a BUSINESS-scoped STAFF grant", async () => {
    mockPrisma.membership.create.mockResolvedValue({ id: "mem-2" } as never);

    await createMembership({
      userId: "user-2",
      role: MembershipRole.STAFF,
      scopeType: MembershipScope.BUSINESS,
      scopeId: "rest-1",
    });

    expect(mockPrisma.membership.create).toHaveBeenCalledWith({
      data: { userId: "user-2", role: MembershipRole.STAFF, scopeType: MembershipScope.BUSINESS, scopeId: "rest-1" },
    });
  });
});

describe("getMembershipsForUser", () => {
  it("returns the user's memberships", async () => {
    const rows = [
      { id: "mem-1", userId: "user-1", role: MembershipRole.OWNER, scopeType: MembershipScope.ORGANIZATION, scopeId: "org-1" },
    ];
    mockPrisma.membership.findMany.mockResolvedValue(rows as never);

    await expect(getMembershipsForUser("user-1")).resolves.toEqual(rows);
    expect(mockPrisma.membership.findMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("returns an empty array when the user has no memberships", async () => {
    mockPrisma.membership.findMany.mockResolvedValue([] as never);

    await expect(getMembershipsForUser("user-none")).resolves.toEqual([]);
  });
});
