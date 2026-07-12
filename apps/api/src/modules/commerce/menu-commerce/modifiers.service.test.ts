import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    menuItem: { findUnique: vi.fn() },
    modifierGroup: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    modifierOption: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    menuItemModifierGroup: { create: vi.fn(), deleteMany: vi.fn(), findMany: vi.fn() },
  },
}));

import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { ModifierGroupAlreadyAttachedError, ModifierGroupNotFoundError } from "./menu-commerce.errors";
import { attachModifierGroupToItem, deleteModifierGroup } from "./modifiers.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("tenant isolation", () => {
  it("rejects deleting a modifier group belonging to another restaurant", async () => {
    mockPrisma.modifierGroup.findUnique.mockResolvedValue({ id: "mg1", restaurantId: "other" } as never);
    await expect(deleteModifierGroup("my-restaurant", "mg1")).rejects.toBeInstanceOf(ModifierGroupNotFoundError);
  });
});

describe("attachModifierGroupToItem", () => {
  it("rejects attaching a group the restaurant doesn't own", async () => {
    mockPrisma.menuItem.findUnique.mockResolvedValue({ id: "item1", restaurantId: "r1" } as never);
    mockPrisma.modifierGroup.findUnique.mockResolvedValue({ id: "mg1", restaurantId: "other" } as never);

    await expect(
      attachModifierGroupToItem("r1", "item1", { modifierGroupId: "mg1" }),
    ).rejects.toBeInstanceOf(ModifierGroupNotFoundError);
  });

  it("maps a unique-constraint violation to ModifierGroupAlreadyAttachedError, not a raw 500", async () => {
    mockPrisma.menuItem.findUnique.mockResolvedValue({ id: "item1", restaurantId: "r1" } as never);
    mockPrisma.modifierGroup.findUnique.mockResolvedValue({ id: "mg1", restaurantId: "r1" } as never);
    mockPrisma.menuItemModifierGroup.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }),
    );

    await expect(
      attachModifierGroupToItem("r1", "item1", { modifierGroupId: "mg1" }),
    ).rejects.toBeInstanceOf(ModifierGroupAlreadyAttachedError);
  });

  it("succeeds for a valid attachment", async () => {
    mockPrisma.menuItem.findUnique.mockResolvedValue({ id: "item1", restaurantId: "r1" } as never);
    mockPrisma.modifierGroup.findUnique.mockResolvedValue({ id: "mg1", restaurantId: "r1" } as never);
    mockPrisma.menuItemModifierGroup.create.mockResolvedValue({ id: "mimg1" } as never);

    await expect(attachModifierGroupToItem("r1", "item1", { modifierGroupId: "mg1" })).resolves.toBeUndefined();
  });
});
