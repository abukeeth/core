import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    $queryRaw: vi.fn(),
    deliveryConfig: { update: vi.fn() },
  },
}));

import { prisma } from "../../../lib/prisma";
import { getConfig, updateConfig } from "./delivery-config.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getConfig", () => {
  it("lazily creates a default config (pickup on, delivery/dine-in off) on first access, via a single atomic raw INSERT ... ON CONFLICT", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: "dc1", isPickupEnabled: true }] as never);

    const config = await getConfig("r1");

    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(config.isPickupEnabled).toBe(true);
  });

  it("returns the existing row unchanged rather than resetting it to defaults (the ON CONFLICT branch is a same-value no-op write)", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: "dc1", isDeliveryEnabled: true }] as never);

    const config = await getConfig("r1");

    expect(config.isDeliveryEnabled).toBe(true);
  });
});

describe("updateConfig", () => {
  it("ensures the row exists before updating", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ id: "dc1" }] as never);
    mockPrisma.deliveryConfig.update.mockResolvedValue({ id: "dc1", isDeliveryEnabled: true } as never);

    const result = await updateConfig("r1", { isDeliveryEnabled: true });

    expect(result.isDeliveryEnabled).toBe(true);
    expect(mockPrisma.deliveryConfig.update).toHaveBeenCalledWith({
      where: { restaurantId: "r1" },
      data: { isDeliveryEnabled: true },
    });
  });
});
