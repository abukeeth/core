import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    restaurant: { findUnique: vi.fn() },
    tax: { deleteMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "../../../lib/prisma";
import { setRestaurantSalesTax } from "./tax-config.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.restaurant.findUnique.mockResolvedValue({ id: "r1" } as never);
  // Run the callback with the same mocked client as its tx.
  mockPrisma.$transaction.mockImplementation(((cb: (tx: typeof prisma) => unknown) => cb(prisma)) as never);
  mockPrisma.tax.create.mockImplementation((async ({ data }: { data: Record<string, unknown> }) => ({ id: "tax1", ...data })) as never);
});

describe("setRestaurantSalesTax", () => {
  it("converts a percentage to basis points and creates an ALL rule by default (idempotent replace)", async () => {
    const result = await setRestaurantSalesTax("r1", { jurisdiction: "New York, NY", ratePercent: 8.875 });

    expect(mockPrisma.tax.deleteMany).toHaveBeenCalledWith({ where: { restaurantId: "r1", appliesTo: "ALL" } });
    expect(mockPrisma.tax.create).toHaveBeenCalledWith({
      data: { restaurantId: "r1", jurisdiction: "New York, NY", rateBasisPoints: 888, appliesTo: "ALL", isActive: true },
    });
    expect(result).toMatchObject({ rateBasisPoints: 888, appliesTo: "ALL" });
  });

  it("stores an exact rate faithfully (8.25% -> 825 bp)", async () => {
    await setRestaurantSalesTax("r1", { jurisdiction: "TX", ratePercent: 8.25 });

    expect(mockPrisma.tax.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rateBasisPoints: 825 }) }),
    );
  });

  it("only replaces the rule for the requested basis, leaving others untouched", async () => {
    await setRestaurantSalesTax("r1", { jurisdiction: "NY", ratePercent: 5, appliesTo: "FOOD" });

    expect(mockPrisma.tax.deleteMany).toHaveBeenCalledWith({ where: { restaurantId: "r1", appliesTo: "FOOD" } });
    expect(mockPrisma.tax.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ appliesTo: "FOOD", rateBasisPoints: 500 }) }),
    );
  });

  it.each([-1, 101, Number.NaN])("rejects an out-of-range rate (%s)", async (rate) => {
    await expect(setRestaurantSalesTax("r1", { jurisdiction: "NY", ratePercent: rate })).rejects.toThrow(/between 0 and 100/);
    expect(mockPrisma.tax.create).not.toHaveBeenCalled();
  });

  it("rejects an empty jurisdiction", async () => {
    await expect(setRestaurantSalesTax("r1", { jurisdiction: "   ", ratePercent: 8 })).rejects.toThrow(/jurisdiction/);
  });

  it("throws a clear error when the restaurant does not exist", async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue(null as never);

    await expect(setRestaurantSalesTax("missing", { jurisdiction: "NY", ratePercent: 8 })).rejects.toThrow(/No restaurant found/);
    expect(mockPrisma.tax.create).not.toHaveBeenCalled();
  });
});
