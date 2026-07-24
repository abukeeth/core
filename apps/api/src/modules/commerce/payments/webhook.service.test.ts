import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    paymentProvider: { findUnique: vi.fn() },
    webhookEvent: { create: vi.fn() },
    paymentAttempt: { findFirst: vi.fn(), update: vi.fn() },
    payment: { findUnique: vi.fn(), update: vi.fn() },
    order: { findUnique: vi.fn(), update: vi.fn() },
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

  async function runRefundWebhook(status: "refunded" | "partially_refunded") {
    mockPrisma.paymentProvider.findUnique.mockResolvedValue(provider() as never);
    mockVerify.mockReturnValue(true);
    mockParse.mockReturnValue({ externalEventId: "evt_r", providerPaymentIntentId: "pi_1", status });
    mockPrisma.webhookEvent.create.mockResolvedValue({ id: "we-r" } as never);
    mockPrisma.paymentAttempt.findFirst.mockResolvedValue({ id: "attempt-1", orderId: "o1" } as never);
    mockPrisma.payment.findUnique.mockResolvedValue({ id: "pay-1", successfulAttemptId: "attempt-1" } as never);
    return handlePaymentWebhook({ providerId: "prov-1", rawBody: "{}", signatureHeader: "good-sig", parsedPayload: {} });
  }

  it("reconciles the Order on an externally-initiated full refund (status → REFUNDED when the transition is allowed)", async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ id: "o1", status: "PREPARING", paymentStatus: "PAID" } as never);

    const outcome = await runRefundWebhook("refunded");

    expect(outcome.status).toBe("processed");
    expect(mockPrisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "o1" }, data: { paymentStatus: "REFUNDED", status: "REFUNDED" } }),
    );
  });

  it("on a full refund of a COMPLETED order, updates paymentStatus but keeps status transition guarded by the state machine", async () => {
    // COMPLETED → REFUNDED IS allowed by the state machine, so status flips too.
    mockPrisma.order.findUnique.mockResolvedValue({ id: "o1", status: "COMPLETED", paymentStatus: "PAID" } as never);

    await runRefundWebhook("refunded");

    expect(mockPrisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paymentStatus: "REFUNDED", status: "REFUNDED" } }),
    );
  });

  it("does not force an illegal status transition on a full refund (only paymentStatus changes)", async () => {
    // CANCELLED → REFUNDED is NOT allowed; paymentStatus still reconciles.
    mockPrisma.order.findUnique.mockResolvedValue({ id: "o1", status: "CANCELLED", paymentStatus: "PAID" } as never);

    await runRefundWebhook("refunded");

    expect(mockPrisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paymentStatus: "REFUNDED" } }),
    );
    expect(mockPrisma.order.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REFUNDED" }) }),
    );
  });

  it("maps a partial refund to PARTIALLY_REFUNDED without touching order status", async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ id: "o1", status: "PREPARING", paymentStatus: "PAID" } as never);

    await runRefundWebhook("partially_refunded");

    expect(mockPrisma.order.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: { paymentStatus: "PARTIALLY_REFUNDED" },
    });
  });

  it("never downgrades an already-full refund back to partial", async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ id: "o1", status: "REFUNDED", paymentStatus: "REFUNDED" } as never);

    await runRefundWebhook("partially_refunded");

    expect(mockPrisma.order.update).not.toHaveBeenCalled();
  });
});
