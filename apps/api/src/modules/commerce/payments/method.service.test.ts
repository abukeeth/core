import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    paymentMethod: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    paymentProvider: { findUnique: vi.fn(), findFirst: vi.fn() },
  },
}));

import { prisma } from "../../../lib/prisma";
import { PaymentMethodNotFoundError, PaymentProviderNotFoundError } from "./payments.errors";
import { setMethodEnabled } from "./method.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("setMethodEnabled", () => {
  it("lazily creates a PaymentMethod row on first enable, using a default provider if none given", async () => {
    mockPrisma.paymentMethod.findUnique.mockResolvedValue(null as never);
    mockPrisma.paymentProvider.findFirst.mockResolvedValue({ id: "prov-1" } as never);
    mockPrisma.paymentMethod.create.mockResolvedValue({ id: "m1", isEnabled: true } as never);

    const result = await setMethodEnabled("r1", "VISA", { isEnabled: true });

    expect(mockPrisma.paymentMethod.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ providerId: "prov-1" }) }),
    );
    expect(result.isEnabled).toBe(true);
  });

  it("rejects a first-time enable when the restaurant has no provider at all", async () => {
    mockPrisma.paymentMethod.findUnique.mockResolvedValue(null as never);
    mockPrisma.paymentProvider.findFirst.mockResolvedValue(null as never);

    await expect(setMethodEnabled("r1", "VISA", { isEnabled: true })).rejects.toBeInstanceOf(
      PaymentProviderNotFoundError,
    );
  });

  it("rejects repointing to a provider that belongs to another restaurant", async () => {
    mockPrisma.paymentProvider.findUnique.mockResolvedValue({ id: "p1", restaurantId: "other" } as never);

    await expect(
      setMethodEnabled("my-restaurant", "VISA", { isEnabled: true, providerId: "p1" }),
    ).rejects.toBeInstanceOf(PaymentProviderNotFoundError);
  });

  it("updates an existing method's enabled flag", async () => {
    mockPrisma.paymentMethod.findUnique.mockResolvedValue({ id: "m1", restaurantId: "r1" } as never);
    mockPrisma.paymentMethod.update.mockResolvedValue({ id: "m1", isEnabled: false } as never);

    const result = await setMethodEnabled("r1", "VISA", { isEnabled: false });

    expect(result.isEnabled).toBe(false);
  });

  it("rejects updating a method that belongs to another restaurant", async () => {
    mockPrisma.paymentMethod.findUnique.mockResolvedValue({ id: "m1", restaurantId: "other" } as never);

    await expect(setMethodEnabled("my-restaurant", "VISA", { isEnabled: false })).rejects.toBeInstanceOf(
      PaymentMethodNotFoundError,
    );
  });
});
