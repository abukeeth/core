import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    paymentProvider: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../../../lib/encryption", () => ({
  encryptSecret: vi.fn((s: string) => `enc:${s}`),
  decryptSecret: vi.fn((s: string) => s.replace(/^enc:/, "")),
}));

import { prisma } from "../../../lib/prisma";
import { PaymentProviderNotFoundError, PaymentProviderNotImplementedError } from "./payments.errors";
import { connectProvider, disconnectProvider, getOwnProviderById, setProviderPriority } from "./provider.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("connectProvider", () => {
  it("passes credentials through encryptSecret before storage, never storing the raw value under any other field", async () => {
    mockPrisma.paymentProvider.upsert.mockResolvedValue({ id: "p1" } as never);

    await connectProvider("r1", "STRIPE", { credentials: "sk_live_super_secret" });

    const call = mockPrisma.paymentProvider.upsert.mock.calls[0][0];
    expect(call.create.credentialsEncrypted).toBe("enc:sk_live_super_secret");
    expect(Object.values(call.create)).not.toContain("sk_live_super_secret");
  });

  it("rejects connecting a not-implemented provider before touching credentials", async () => {
    await expect(connectProvider("r1", "SQUARE", { credentials: "whatever" })).rejects.toBeInstanceOf(
      PaymentProviderNotImplementedError,
    );
    expect(mockPrisma.paymentProvider.upsert).not.toHaveBeenCalled();
  });

  it("persists publicKey when supplied (Sprint 07.6 C-1)", async () => {
    mockPrisma.paymentProvider.upsert.mockResolvedValue({ id: "p1" } as never);

    await connectProvider("r1", "STRIPE", { credentials: "sk_live_secret", publicKey: "pk_live_public" });

    const call = mockPrisma.paymentProvider.upsert.mock.calls[0][0];
    expect(call.create.publicKey).toBe("pk_live_public");
    expect(call.update.publicKey).toBe("pk_live_public");
  });

  it("leaves publicKey null when omitted", async () => {
    mockPrisma.paymentProvider.upsert.mockResolvedValue({ id: "p1" } as never);

    await connectProvider("r1", "STRIPE", { credentials: "sk_live_secret" });

    const call = mockPrisma.paymentProvider.upsert.mock.calls[0][0];
    expect(call.create.publicKey).toBeUndefined();
  });
});

describe("tenant isolation", () => {
  it("rejects disconnecting a provider that belongs to another restaurant", async () => {
    mockPrisma.paymentProvider.findUnique.mockResolvedValue({
      id: "p1",
      restaurantId: "other-restaurant",
    } as never);

    await expect(disconnectProvider("my-restaurant", "STRIPE")).rejects.toBeInstanceOf(PaymentProviderNotFoundError);
    expect(mockPrisma.paymentProvider.update).not.toHaveBeenCalled();
  });

  it("rejects setting priority on a provider that belongs to another restaurant", async () => {
    mockPrisma.paymentProvider.findUnique.mockResolvedValue({
      id: "p1",
      restaurantId: "other-restaurant",
    } as never);

    await expect(
      setProviderPriority("my-restaurant", "STRIPE", { priority: 1, isDefault: true }),
    ).rejects.toBeInstanceOf(PaymentProviderNotFoundError);
  });

  it("rejects fetching a provider by id that belongs to another restaurant", async () => {
    mockPrisma.paymentProvider.findUnique.mockResolvedValue({
      id: "p1",
      restaurantId: "other-restaurant",
    } as never);

    await expect(getOwnProviderById("my-restaurant", "p1")).rejects.toBeInstanceOf(PaymentProviderNotFoundError);
  });
});
