import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    pOSProvider: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    pOSSyncLog: { create: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock("../../../lib/encryption", () => ({
  encryptSecret: vi.fn((s: string) => `enc:${s}`),
}));

import { prisma } from "../../../lib/prisma";
import { POSProviderNotFoundError, POSProviderNotImplementedError } from "./pos.errors";
import { connectProvider, disconnectProvider, triggerSync } from "./pos.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("connectProvider", () => {
  it("rejects connecting any stub POS provider", async () => {
    await expect(connectProvider("r1", "SQUARE_POS", { credentials: "key" })).rejects.toBeInstanceOf(
      POSProviderNotImplementedError,
    );
    expect(mockPrisma.pOSProvider.upsert).not.toHaveBeenCalled();
  });
});

describe("tenant isolation", () => {
  it("rejects disconnecting a provider belonging to another restaurant", async () => {
    mockPrisma.pOSProvider.findUnique.mockResolvedValue({ id: "p1", restaurantId: "other" } as never);
    await expect(disconnectProvider("my-restaurant", "SQUARE_POS")).rejects.toBeInstanceOf(POSProviderNotFoundError);
  });
});

describe("triggerSync", () => {
  it("writes a FAILED POSSyncLog row even though the provider always throws", async () => {
    mockPrisma.pOSProvider.findUnique.mockResolvedValue({
      id: "p1",
      restaurantId: "r1",
      syncDirection: "MENU_IMPORT",
    } as never);

    await expect(triggerSync("r1", "SQUARE_POS")).rejects.toBeInstanceOf(POSProviderNotImplementedError);
    expect(mockPrisma.pOSSyncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED", posProviderId: "p1" }) }),
    );
  });
});
