import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    paymentProvider: { findFirst: vi.fn() },
  },
}));

import { prisma } from "../../../lib/prisma";
import { getPublicPaymentConfig } from "./public-payment-config.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPublicPaymentConfig", () => {
  it("returns null when no CONNECTED Stripe provider with a publicKey exists", async () => {
    mockPrisma.paymentProvider.findFirst.mockResolvedValue(null as never);

    const config = await getPublicPaymentConfig("r1");

    expect(config).toBeNull();
  });

  it("returns providerType/publicKey when a CONNECTED provider has one", async () => {
    mockPrisma.paymentProvider.findFirst.mockResolvedValue({
      providerType: "STRIPE",
      publicKey: "pk_live_abc",
      credentialsEncrypted: "enc:sk_live_secret",
      webhookSecretEncrypted: "enc:whsec_secret",
    } as never);

    const config = await getPublicPaymentConfig("r1");

    expect(config).toEqual({ providerType: "STRIPE", publicKey: "pk_live_abc" });
  });

  it("never returns credentialsEncrypted/webhookSecretEncrypted or any other provider field", async () => {
    mockPrisma.paymentProvider.findFirst.mockResolvedValue({
      providerType: "STRIPE",
      publicKey: "pk_live_abc",
      credentialsEncrypted: "enc:sk_live_secret",
      webhookSecretEncrypted: "enc:whsec_secret",
      id: "provider-1",
      restaurantId: "r1",
    } as never);

    const config = await getPublicPaymentConfig("r1");

    expect(Object.keys(config ?? {}).sort()).toEqual(["providerType", "publicKey"].sort());
  });

  it("returns null when the matching provider has no publicKey set", async () => {
    mockPrisma.paymentProvider.findFirst.mockResolvedValue(null as never);

    const config = await getPublicPaymentConfig("r1");

    expect(config).toBeNull();
    expect(mockPrisma.paymentProvider.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ restaurantId: "r1", providerType: "STRIPE", publicKey: { not: null } }),
      }),
    );
  });
});
