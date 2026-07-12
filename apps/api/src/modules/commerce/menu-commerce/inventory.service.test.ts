import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    menuItem: { findUnique: vi.fn() },
    menuItemInventory: { upsert: vi.fn(), update: vi.fn() },
  },
}));

import { prisma } from "../../../lib/prisma";
import { MenuItemNotFoundError } from "./menu-commerce.errors";
import { getInventory, isItemOrderable, toggleOutOfStock } from "./inventory.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getInventory", () => {
  it("rejects a menu item belonging to another restaurant", async () => {
    mockPrisma.menuItem.findUnique.mockResolvedValue({ id: "item1", restaurantId: "other" } as never);
    await expect(getInventory("my-restaurant", "item1")).rejects.toBeInstanceOf(MenuItemNotFoundError);
  });

  it("lazily upserts a default row", async () => {
    mockPrisma.menuItem.findUnique.mockResolvedValue({ id: "item1", restaurantId: "r1" } as never);
    mockPrisma.menuItemInventory.upsert.mockResolvedValue({ trackInventory: false } as never);

    const inventory = await getInventory("r1", "item1");
    expect(inventory.trackInventory).toBe(false);
  });
});

describe("toggleOutOfStock", () => {
  it("is a fast single-purpose update, not requiring the full inventory payload", async () => {
    mockPrisma.menuItem.findUnique.mockResolvedValue({ id: "item1", restaurantId: "r1" } as never);
    mockPrisma.menuItemInventory.upsert.mockResolvedValue({} as never);
    mockPrisma.menuItemInventory.update.mockResolvedValue({ isTemporarilyOutOfStock: true } as never);

    const result = await toggleOutOfStock("r1", "item1", { isTemporarilyOutOfStock: true });
    expect(result.isTemporarilyOutOfStock).toBe(true);
  });
});

describe("isItemOrderable", () => {
  it("is false when the item itself is unavailable", () => {
    expect(isItemOrderable({ isAvailable: false }, null)).toBe(false);
  });

  it("is true when available with no inventory record at all", () => {
    expect(isItemOrderable({ isAvailable: true }, null)).toBe(true);
  });

  it("is false when temporarily out of stock (86'd), regardless of trackInventory", () => {
    expect(
      isItemOrderable(
        { isAvailable: true },
        { isTemporarilyOutOfStock: true, trackInventory: false, quantityAvailable: null },
      ),
    ).toBe(false);
  });

  it("is false when trackInventory is on and quantityAvailable has hit zero", () => {
    expect(
      isItemOrderable(
        { isAvailable: true },
        { isTemporarilyOutOfStock: false, trackInventory: true, quantityAvailable: 0 },
      ),
    ).toBe(false);
  });

  it("is true when trackInventory is on but quantity remains", () => {
    expect(
      isItemOrderable(
        { isAvailable: true },
        { isTemporarilyOutOfStock: false, trackInventory: true, quantityAvailable: 3 },
      ),
    ).toBe(true);
  });

  it("is true when trackInventory is off, regardless of quantityAvailable value", () => {
    expect(
      isItemOrderable(
        { isAvailable: true },
        { isTemporarilyOutOfStock: false, trackInventory: false, quantityAvailable: 0 },
      ),
    ).toBe(true);
  });
});
