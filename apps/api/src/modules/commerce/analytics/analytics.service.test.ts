import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    order: { aggregate: vi.fn(), groupBy: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

import { prisma } from "../../../lib/prisma";
import { getRevenueSummary, getRevenueByDay, getTopItems } from "./analytics.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getRevenueSummary", () => {
  it("combines aggregate totals with a status breakdown, excluding CANCELLED/FAILED from the revenue figures", async () => {
    mockPrisma.order.aggregate.mockResolvedValue({
      _sum: { totalCents: 15000 },
      _avg: { totalCents: 2500.4 },
      _count: 6,
    } as never);
    mockPrisma.order.groupBy.mockResolvedValue([
      { status: "COMPLETED", _count: 5 },
      { status: "CANCELLED", _count: 2 },
    ] as never);

    const result = await getRevenueSummary("rest-1", 30);

    expect(result).toEqual({
      totalRevenueCents: 15000,
      averageOrderValueCents: 2500,
      totalOrders: 6,
      ordersByStatus: { COMPLETED: 5, CANCELLED: 2 },
    });
    expect(mockPrisma.order.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          restaurantId: "rest-1",
          status: { notIn: ["CANCELLED", "FAILED"] },
        }),
      }),
    );
  });

  it("defaults revenue and order count to 0 when there are no matching orders", async () => {
    mockPrisma.order.aggregate.mockResolvedValue({
      _sum: { totalCents: null },
      _avg: { totalCents: null },
      _count: 0,
    } as never);
    mockPrisma.order.groupBy.mockResolvedValue([] as never);

    const result = await getRevenueSummary("rest-1", 7);

    expect(result.totalRevenueCents).toBe(0);
    expect(result.averageOrderValueCents).toBe(0);
    expect(result.totalOrders).toBe(0);
    expect(result.ordersByStatus).toEqual({});
  });
});

describe("getRevenueByDay", () => {
  it("returns the raw-query rows unchanged", async () => {
    const rows = [
      { day: new Date("2026-07-01"), revenueCents: 5000, orderCount: 2 },
      { day: new Date("2026-07-02"), revenueCents: 8000, orderCount: 3 },
    ];
    mockPrisma.$queryRaw.mockResolvedValue(rows as never);

    const result = await getRevenueByDay("rest-1", 30);

    expect(result).toEqual(rows);
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe("getTopItems", () => {
  it("returns the raw-query rows unchanged", async () => {
    const rows = [{ menuItemId: "item-1", name: "Burger", quantitySold: 42, revenueCents: 42000 }];
    mockPrisma.$queryRaw.mockResolvedValue(rows as never);

    const result = await getTopItems("rest-1", 30, 10);

    expect(result).toEqual(rows);
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
