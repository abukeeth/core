import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    restaurantHours: { count: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
  },
}));

import { prisma } from "../../../lib/prisma";
import { ensureDefaultBusinessHours, isRestaurantOpenAt } from "./hours.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ensureDefaultBusinessHours (Onboarding V3 — open 24/7 by default)", () => {
  it("seeds a full open week when the store has no hours yet", async () => {
    mockPrisma.restaurantHours.count.mockResolvedValue(0);

    await ensureDefaultBusinessHours("rest-1");

    expect(mockPrisma.restaurantHours.createMany).toHaveBeenCalledTimes(1);
    const arg = mockPrisma.restaurantHours.createMany.mock.calls[0]![0] as { data: Array<Record<string, unknown>> };
    expect(arg.data).toHaveLength(7);
    for (const dayRow of arg.data) {
      expect(dayRow).toMatchObject({ restaurantId: "rest-1", opensAt: 0, closesAt: 1439, isClosed: false });
    }
    expect(new Set(arg.data.map((d) => d.dayOfWeek)).size).toBe(7);
  });

  it("never overwrites an owner's existing hours", async () => {
    mockPrisma.restaurantHours.count.mockResolvedValue(3);

    await ensureDefaultBusinessHours("rest-1");

    expect(mockPrisma.restaurantHours.createMany).not.toHaveBeenCalled();
  });

  it("the seeded 24/7 schedule reads as open through the day", () => {
    const seeded = [
      { dayOfWeek: "MONDAY", opensAt: 0, closesAt: 1439, isClosed: false },
      { dayOfWeek: "TUESDAY", opensAt: 0, closesAt: 1439, isClosed: false },
    ];
    expect(isRestaurantOpenAt(seeded as never, new Date("2026-07-06T12:00:00"))).toBe(true); // Monday noon
    expect(isRestaurantOpenAt(seeded as never, new Date("2026-07-06T03:30:00"))).toBe(true); // Monday early AM
  });
});
