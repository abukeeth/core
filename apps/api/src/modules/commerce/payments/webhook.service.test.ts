import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    paymentProvider: { findUnique: vi.fn() },
    webhookEvent: { create: vi.fn() },
    paymentAttempt: { findFirst: vi.fn(), update: vi.fn() },
    payment: { findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../../../lib/encryption", () => ({
  decryptSecret: vi.fn((s: string) => s.replace(/^enc:/, "")),
}));

const mockVerify = vi.fn();
const mockParse = vi.fn();
vi.mock("./registry", () => ({
  paymentProviderRegistry: {
    get: vi.fn(() => ({
      providerType: "STRIPE",
      implemented: true,
      verifyWebhookSignature: mockVerify,
      parseWebhookEvent: mockParse,
    })),
  },
}));

import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { handlePaymentWebhook } from "./webhook.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

function provider() {
  return { id: "prov-1", providerType: "STRIPE", webhookSecretEncrypted: "enc:whsec_123" };
}

describe("handlePaymentWebhook", () => {
  it("returns provider_not_found when the providerId doesn't resolve", async () => {
    mockPrisma.paymentProvider.findUnique.mockResolvedValue(null as never);

    const outcome = await handlePaymentWebhook({
      providerId: "missing",
      rawBody: "{}",
      signatureHeader: "sig",
      parsedPayload: {},
    });

    expect(outcome.status).toBe("provider_not_found");
  });

  it("rejects an invalid signature without writing a WebhookEvent", async () => {
    mockPrisma.paymentProvider.findUnique.mockResolvedValue(provider() as never);
    mockVerify.mockReturnValue(false);

    const outcome = await handlePaymentWebhook({
      providerId: "prov-1",
      rawBody: "{}",
      signatureHeader: "bad-sig",
      parsedPayload: {},
    });

    expect(outcome.status).toBe("invalid_signature");
    expect(mockPrisma.webhookEvent.create).not.toHaveBeenCalled();
  });

  it("processes a valid webhook and updates PaymentAttempt/Payment status", async () => {
    mockPrisma.paymentProvider.findUnique.mockResolvedValue(provider() as never);
    mockVerify.mockReturnValue(true);
    mockParse.mockReturnValue({ externalEventId: "evt_1", providerPaymentIntentId: "pi_1", status: "captured" });
    mockPrisma.webhookEvent.create.mockResolvedValue({ id: "we-1" } as never);
    mockPrisma.paymentAttempt.findFirst.mockResolvedValue({ id: "attempt-1", orderId: "o1" } as never);
    mockPrisma.payment.findUnique.mockResolvedValue({ id: "pay-1", successfulAttemptId: "attempt-1" } as never);

    const outcome = await handlePaymentWebhook({
      providerId: "prov-1",
      rawBody: "{}",
      signatureHeader: "good-sig",
      parsedPayload: { type: "payment_intent.succeeded" },
    });

    expect(outcome.status).toBe("processed");
    expect(mockPrisma.paymentAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "CAPTURED" } }),
    );
    expect(mockPrisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "CAPTURED" } }),
    );
  });

  it("treats a duplicate externalEventId as a no-op, not an error", async () => {
    mockPrisma.paymentProvider.findUnique.mockResolvedValue(provider() as never);
    mockVerify.mockReturnValue(true);
    mockParse.mockReturnValue({ externalEventId: "evt_1", status: "captured" });
    mockPrisma.webhookEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    const outcome = await handlePaymentWebhook({
      providerId: "prov-1",
      rawBody: "{}",
      signatureHeader: "good-sig",
      parsedPayload: {},
    });

    expect(outcome.status).toBe("duplicate");
  });
});
