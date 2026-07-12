import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    menuItem: { findUnique: vi.fn() },
    menuItemVariant: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));

import { prisma } from "../../../lib/prisma";
import { MenuItemNotFoundError, VariantNotFoundError } from "./menu-commerce.errors";
import { createVariant, deleteVariant, updateVariant } from "./variants.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("tenant isolation", () => {
  it("rejects creating a variant on a menu item belonging to another restaurant", async () => {
    mockPrisma.menuItem.findUnique.mockResolvedValue({ id: "item1", restaurantId: "other" } as never);

    await expect(
      createVariant("my-restaurant", "item1", { name: "Large", priceDeltaCents: 200 }),
    ).rejects.toBeInstanceOf(MenuItemNotFoundError);
  });

  it("rejects updating a variant belonging to another restaurant's item", async () => {
    mockPrisma.menuItemVariant.findUnique.mockResolvedValue({ id: "v1", menuItemId: "item1" } as never);
    mockPrisma.menuItem.findUnique.mockResolvedValue({ id: "item1", restaurantId: "other" } as never);

    await expect(updateVariant("my-restaurant", "item1", "v1", { name: "Hacked" })).rejects.toBeInstanceOf(
      MenuItemNotFoundError,
    );
  });

  it("rejects deleting a variant that does not belong to the given menu item", async () => {
    mockPrisma.menuItemVariant.findUnique.mockResolvedValue({ id: "v1", menuItemId: "different-item" } as never);

    await expect(deleteVariant("r1", "item1", "v1")).rejects.toBeInstanceOf(VariantNotFoundError);
  });
});
