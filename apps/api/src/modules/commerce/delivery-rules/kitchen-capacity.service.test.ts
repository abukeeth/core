import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    kitchenCapacity: { update: vi.fn() },
  },
}));

import { prisma } from "../../../lib/prisma";
import { getCapacity, isKitchenAvailable } from "./kitchen-capacity.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCapacity", () => {
  it("lazily creates a default row (accepting orders, no caps) via a single atomic raw INSERT ... ON CONFLICT", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: "kc1", isAcceptingOrders: true }] as never);

    const capacity = await getCapacity("r1");

    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(capacity.isAcceptingOrders).toBe(true);
  });

  it("returns the existing row unchanged rather than resetting it to defaults (the ON CONFLICT branch is a same-value no-op write)", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: "kc1", isAcceptingOrders: false, maxConcurrentOrders: 10 }] as never);

    const capacity = await getCapacity("r1");

    expect(capacity.isAcceptingOrders).toBe(false);
    expect(capacity.maxConcurrentOrders).toBe(10);
  });
});

describe("isKitchenAvailable", () => {
  it("is false when manually paused, regardless of order count", () => {
    expect(isKitchenAvailable({ isAcceptingOrders: false, maxConcurrentOrders: null } as never, 0)).toBe(false);
  });

  it("is false when at or above the configured concurrent-order cap", () => {
    expect(isKitchenAvailable({ isAcceptingOrders: true, maxConcurrentOrders: 5 } as never, 5)).toBe(false);
    expect(isKitchenAvailable({ isAcceptingOrders: true, maxConcurrentOrders: 5 } as never, 6)).toBe(false);
  });

  it("is true when accepting orders and under the cap", () => {
    expect(isKitchenAvailable({ isAcceptingOrders: true, maxConcurrentOrders: 5 } as never, 4)).toBe(true);
  });

  it("is true when accepting orders and no cap is configured", () => {
    expect(isKitchenAvailable({ isAcceptingOrders: true, maxConcurrentOrders: null } as never, 1000)).toBe(true);
  });
});
