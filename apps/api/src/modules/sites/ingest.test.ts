import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    restaurant: { findUniqueOrThrow: vi.fn() },
    siteAsset: { count: vi.fn() },
  },
}));

import { prisma } from "../../lib/prisma";
import { ingestRestaurantData } from "./ingest";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ingestRestaurantData", () => {
  it("maps categories/items into a flat menu list, in category then sortOrder", async () => {
    mockPrisma.restaurant.findUniqueOrThrow.mockResolvedValue({
      id: "r1",
      name: "Trattoria Bella",
      description: "A cozy Italian kitchen",
      address: "123 Main St",
      phone: "555-0100",
      categories: [
        {
          name: "Mains",
          items: [
            { name: "Spaghetti", description: "Classic", priceCents: 1500, isAvailable: true },
            { name: "Lasagna", description: null, priceCents: 1800, isAvailable: true },
          ],
        },
        { name: "Desserts", items: [{ name: "Tiramisu", description: null, priceCents: 900, isAvailable: true }] },
      ],
    } as never);
    mockPrisma.siteAsset.count.mockResolvedValue(4);

    const result = await ingestRestaurantData("r1");

    expect(result.menu).toEqual([
      { categoryName: "Mains", name: "Spaghetti", description: "Classic", priceCents: 1500 },
      { categoryName: "Mains", name: "Lasagna", description: undefined, priceCents: 1800 },
      { categoryName: "Desserts", name: "Tiramisu", description: undefined, priceCents: 900 },
    ]);
    expect(result.photoCount).toBe(4);
    expect(result.restaurantName).toBe("Trattoria Bella");
  });

  it("excludes unavailable items from the ingested menu", async () => {
    mockPrisma.restaurant.findUniqueOrThrow.mockResolvedValue({
      id: "r1",
      name: "Trattoria Bella",
      description: null,
      address: null,
      phone: null,
      categories: [
        {
          name: "Mains",
          items: [
            { name: "Spaghetti", description: null, priceCents: 1500, isAvailable: true },
            { name: "86'd Special", description: null, priceCents: 2000, isAvailable: false },
          ],
        },
      ],
    } as never);
    mockPrisma.siteAsset.count.mockResolvedValue(0);

    const result = await ingestRestaurantData("r1");

    expect(result.menu).toHaveLength(1);
    expect(result.menu[0].name).toBe("Spaghetti");
  });

  it("always returns logoColorSeed as undefined (not implemented this sprint)", async () => {
    mockPrisma.restaurant.findUniqueOrThrow.mockResolvedValue({
      id: "r1",
      name: "Trattoria Bella",
      description: null,
      address: null,
      phone: null,
      categories: [],
    } as never);
    mockPrisma.siteAsset.count.mockResolvedValue(0);

    const result = await ingestRestaurantData("r1");

    expect(result.logoColorSeed).toBeUndefined();
  });
});
