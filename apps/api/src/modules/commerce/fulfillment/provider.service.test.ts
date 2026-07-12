import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    fulfillmentProvider: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../../../lib/encryption", () => ({
  encryptSecret: vi.fn((s: string) => `enc:${s}`),
  decryptSecret: vi.fn((s: string) => s.replace(/^enc:/, "")),
}));

import { prisma } from "../../../lib/prisma";
import { FulfillmentProviderNotFoundError, FulfillmentProviderNotImplementedError } from "./fulfillment.errors";
import { connectProvider, disconnectProvider, getDecryptedCredentials } from "./provider.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("connectProvider", () => {
  it("rejects connecting any of the three stub providers", async () => {
    await expect(connectProvider("r1", "UBER_DIRECT", "api-key")).rejects.toBeInstanceOf(
      FulfillmentProviderNotImplementedError,
    );
    expect(mockPrisma.fulfillmentProvider.upsert).not.toHaveBeenCalled();
  });
});

describe("tenant isolation", () => {
  it("rejects disconnecting a provider belonging to another restaurant", async () => {
    mockPrisma.fulfillmentProvider.findUnique.mockResolvedValue({
      id: "p1",
      restaurantId: "other",
    } as never);

    await expect(disconnectProvider("my-restaurant", "UBER_DIRECT")).rejects.toBeInstanceOf(
      FulfillmentProviderNotFoundError,
    );
  });

  it("rejects reading decrypted credentials for another restaurant's provider", async () => {
    mockPrisma.fulfillmentProvider.findUnique.mockResolvedValue({
      id: "p1",
      restaurantId: "other",
      credentialsEncrypted: "enc:secret",
    } as never);

    await expect(getDecryptedCredentials("my-restaurant", "UBER_DIRECT")).rejects.toBeInstanceOf(
      FulfillmentProviderNotFoundError,
    );
  });
});
