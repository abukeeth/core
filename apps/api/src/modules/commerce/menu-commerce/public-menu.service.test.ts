import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    restaurant: { findUnique: vi.fn() },
    menuCategory: { findMany: vi.fn() },
  },
}));

import { prisma } from "../../../lib/prisma";
import { RestaurantNotFoundError } from "../../restaurants/restaurant.errors";
import { getPublicMenu } from "./public-menu.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPublicMenu", () => {
  it("throws RestaurantNotFoundError for a nonexistent restaurant", async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue(null);
    await expect(getPublicMenu("nonexistent")).rejects.toBeInstanceOf(RestaurantNotFoundError);
  });

  it("throws RestaurantNotFoundError (not a 403) for an unpublished restaurant", async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue({ id: "r1", isPublished: false } as never);
    await expect(getPublicMenu("r1")).rejects.toBeInstanceOf(RestaurantNotFoundError);
  });

  it("marks an item unorderable when temporarily out of stock", async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue({
      id: "r1",
      isPublished: true,
      name: "Test",
      description: null,
      address: null,
    } as never);
    mockPrisma.menuCategory.findMany.mockResolvedValue([
      {
        id: "cat1",
        name: "Mains",
        items: [
          {
            id: "item1",
            name: "Salmon",
            description: null,
            priceCents: 1500,
            isAvailable: true,
            variants: [],
            modifierGroups: [],
            inventory: { isTemporarilyOutOfStock: true, trackInventory: false, quantityAvailable: null },
          },
        ],
      },
    ] as never);

    const menu = await getPublicMenu("r1");

    expect(menu.categories[0].items[0].isOrderable).toBe(false);
  });

  it("nests modifier groups and variants correctly", async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue({
      id: "r1",
      isPublished: true,
      name: "Test",
      description: null,
      address: null,
    } as never);
    mockPrisma.menuCategory.findMany.mockResolvedValue([
      {
        id: "cat1",
        name: "Mains",
        items: [
          {
            id: "item1",
            name: "Burger",
            description: null,
            priceCents: 1000,
            isAvailable: true,
            inventory: null,
            variants: [{ id: "v1", name: "Large", priceDeltaCents: 200, isDefault: false }],
            modifierGroups: [
              {
                modifierGroup: {
                  id: "mg1",
                  name: "Toppings",
                  selectionType: "MULTIPLE",
                  isRequired: false,
                  minSelections: 0,
                  maxSelections: 3,
                  options: [{ id: "o1", name: "Cheese", priceDeltaCents: 100, isAvailable: true }],
                },
              },
            ],
          },
        ],
      },
    ] as never);

    const menu = await getPublicMenu("r1");
    const item = menu.categories[0].items[0];

    expect(item.isOrderable).toBe(true);
    expect(item.variants).toEqual([{ id: "v1", name: "Large", priceDeltaCents: 200, isDefault: false }]);
    expect(item.modifierGroups[0].options).toEqual([{ id: "o1", name: "Cheese", priceDeltaCents: 100, isAvailable: true }]);
  });
});
