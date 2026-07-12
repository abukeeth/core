import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    paymentMethod: { findUnique: vi.fn() },
    paymentProvider: { findMany: vi.fn() },
    paymentAttempt: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    payment: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    refund: { create: vi.fn() },
    transaction: { create: vi.fn() },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

vi.mock("../../../lib/encryption", () => ({
  encryptSecret: vi.fn((s: string) => `enc:${s}`),
  decryptSecret: vi.fn((s: string) => s.replace(/^enc:/, "")),
}));

const mockAuthorize = vi.fn();
const mockCapture = vi.fn();
const mockVoid = vi.fn();
const mockRefund = vi.fn();
vi.mock("./registry", () => ({
  paymentProviderRegistry: {
    get: vi.fn(() => ({
      providerType: "STRIPE",
      implemented: true,
      authorize: mockAuthorize,
      capture: mockCapture,
      void: mockVoid,
      refund: mockRefund,
    })),
  },
}));

import { __resetMetricsForTests, getMetrics } from "../../../lib/metrics";
import { prisma } from "../../../lib/prisma";
import {
  NoAvailableProviderError,
  PaymentMethodNotFoundError,
  PaymentNotFoundError,
  PaymentVoidFailedError,
  RefundExceedsRemainingBalanceError,
  RefundFailedError,
} from "./payments.errors";
import { authorizeOrderPayment, captureOrderPayment, refundOrderPayment } from "./orchestrator";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
  __resetMetricsForTests();
  // Every test's happy-path attempt-row lifecycle: create the PENDING
  // reservation, then update it with the provider's result.
  mockPrisma.paymentAttempt.create.mockResolvedValue({ id: "attempt-1" } as never);
  mockPrisma.paymentAttempt.update.mockResolvedValue({ id: "attempt-1" } as never);
});

function provider(overrides: Record<string, unknown> = {}) {
  return {
    id: "prov-1",
    providerType: "STRIPE",
    status: "CONNECTED",
    priority: 0,
    isDefault: true,
    credentialsEncrypted: "enc:sk_test_123",
    ...overrides,
  };
}

describe("authorizeOrderPayment", () => {
  it("throws PaymentMethodNotFoundError when the method is disabled or missing", async () => {
    mockPrisma.paymentMethod.findUnique.mockResolvedValue(null as never);

    await expect(
      authorizeOrderPayment({
        orderId: "o1",
        restaurantId: "r1",
        methodType: "VISA",
        methodToken: "pm_123",
        amountCents: 1000,
        currency: "usd",
      }),
    ).rejects.toBeInstanceOf(PaymentMethodNotFoundError);
  });

  it("authorizes against the primary provider when it is connected", async () => {
    mockPrisma.paymentMethod.findUnique.mockResolvedValue({
      isEnabled: true,
      provider: provider(),
    } as never);
    mockAuthorize.mockResolvedValue({ success: true, providerPaymentIntentId: "pi_123" });
    mockPrisma.payment.upsert.mockResolvedValue({ id: "payment-1", status: "AUTHORIZED" } as never);

    const result = await authorizeOrderPayment({
      orderId: "o1",
      restaurantId: "r1",
      methodType: "VISA",
      methodToken: "pm_123",
      amountCents: 1000,
      currency: "usd",
    });

    expect(result.payment.id).toBe("payment-1");
    expect(mockPrisma.paymentProvider.findMany).not.toHaveBeenCalled();
    expect(mockAuthorize).toHaveBeenCalledTimes(1);
  });

  it("(Production Hardening Phase 9) records a payment_provider_results_total success observation labeled by provider", async () => {
    mockPrisma.paymentMethod.findUnique.mockResolvedValue({
      isEnabled: true,
      provider: provider(),
    } as never);
    mockAuthorize.mockResolvedValue({ success: true, providerPaymentIntentId: "pi_123" });
    mockPrisma.payment.upsert.mockResolvedValue({ id: "payment-1", status: "AUTHORIZED" } as never);

    await authorizeOrderPayment({
      orderId: "o1",
      restaurantId: "r1",
      methodType: "VISA",
      methodToken: "pm_123",
      amountCents: 1000,
      currency: "usd",
    });

    const output = await getMetrics();
    expect(output).toContain('payment_provider_results_total{provider="STRIPE",result="success"} 1');
  });

  it("(Production Hardening Phase 9) records a failure observation, distinct from success, when the provider declines", async () => {
    mockPrisma.paymentMethod.findUnique.mockResolvedValue({
      isEnabled: true,
      provider: provider(),
    } as never);
    mockPrisma.paymentProvider.findMany.mockResolvedValue([]);
    mockAuthorize.mockResolvedValue({ success: false, failureCode: "card_declined", failureMessage: "Card declined" });

    await expect(
      authorizeOrderPayment({
        orderId: "o1",
        restaurantId: "r1",
        methodType: "VISA",
        methodToken: "pm_123",
        amountCents: 1000,
        currency: "usd",
      }),
    ).rejects.toBeInstanceOf(NoAvailableProviderError);

    const output = await getMetrics();
    expect(output).toContain('payment_provider_results_total{provider="STRIPE",result="failure"} 1');
  });

  it("reserves a PENDING attempt row before calling the provider, then updates it with the result", async () => {
    mockPrisma.paymentMethod.findUnique.mockResolvedValue({
      isEnabled: true,
      provider: provider(),
    } as never);
    mockAuthorize.mockResolvedValue({ success: true, providerPaymentIntentId: "pi_123" });
    mockPrisma.payment.upsert.mockResolvedValue({ id: "payment-1" } as never);

    await authorizeOrderPayment({
      orderId: "o1",
      restaurantId: "r1",
      methodType: "VISA",
      methodToken: "pm_123",
      amountCents: 1000,
      currency: "usd",
    });

    // The PENDING row is created BEFORE the provider call — if the
    // provider succeeds but the subsequent update fails, this row still
    // anchors a reconciliation pass rather than the authorization being
    // left with zero record anywhere.
    expect(mockPrisma.paymentAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PENDING" }) }),
    );
    const createOrder = mockPrisma.paymentAttempt.create.mock.invocationCallOrder[0];
    const authorizeOrder = mockAuthorize.mock.invocationCallOrder[0];
    expect(createOrder).toBeLessThan(authorizeOrder);

    expect(mockPrisma.paymentAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "attempt-1" },
        data: expect.objectContaining({ status: "AUTHORIZED", providerPaymentIntentId: "pi_123" }),
      }),
    );
  });

  it("leaves a PENDING attempt row queryable if the provider call succeeds but the result-update write fails", async () => {
    mockPrisma.paymentMethod.findUnique.mockResolvedValue({
      isEnabled: true,
      provider: provider(),
    } as never);
    mockAuthorize.mockResolvedValue({ success: true, providerPaymentIntentId: "pi_123" });
    mockPrisma.paymentAttempt.update.mockRejectedValue(new Error("connection pool exhausted"));

    await expect(
      authorizeOrderPayment({
        orderId: "o1",
        restaurantId: "r1",
        methodType: "VISA",
        methodToken: "pm_123",
        amountCents: 1000,
        currency: "usd",
      }),
    ).rejects.toThrow("connection pool exhausted");

    // The PENDING row from before the provider call is still there —
    // this is the finding's whole point: no record is ever fully lost.
    expect(mockPrisma.paymentAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ orderId: "o1", status: "PENDING" }) }),
    );
  });

  it("falls back to the next-priority connected provider when the primary is disconnected", async () => {
    mockPrisma.paymentMethod.findUnique.mockResolvedValue({
      isEnabled: true,
      provider: provider({ status: "DISCONNECTED" }),
    } as never);
    mockPrisma.paymentProvider.findMany.mockResolvedValue([
      provider({ id: "prov-2", priority: 1 }),
      provider({ id: "prov-3", priority: 2 }),
    ] as never);
    mockAuthorize
      .mockResolvedValueOnce({ success: false, failureMessage: "declined" })
      .mockResolvedValueOnce({ success: true, providerPaymentIntentId: "pi_456" });
    mockPrisma.payment.upsert.mockResolvedValue({ id: "payment-1" } as never);

    const result = await authorizeOrderPayment({
      orderId: "o1",
      restaurantId: "r1",
      methodType: "VISA",
      methodToken: "pm_123",
      amountCents: 1000,
      currency: "usd",
    });

    expect(mockPrisma.paymentProvider.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ restaurantId: "r1", status: "CONNECTED" }) }),
    );
    expect(mockAuthorize).toHaveBeenCalledTimes(2);
    expect(result.payment.id).toBe("payment-1");
  });

  it("throws NoAvailableProviderError when there are no connected candidates", async () => {
    mockPrisma.paymentMethod.findUnique.mockResolvedValue({
      isEnabled: true,
      provider: provider({ status: "DISCONNECTED" }),
    } as never);
    mockPrisma.paymentProvider.findMany.mockResolvedValue([] as never);

    await expect(
      authorizeOrderPayment({
        orderId: "o1",
        restaurantId: "r1",
        methodType: "VISA",
        methodToken: "pm_123",
        amountCents: 1000,
        currency: "usd",
      }),
    ).rejects.toBeInstanceOf(NoAvailableProviderError);
  });

  it("throws NoAvailableProviderError when every candidate fails to authorize", async () => {
    mockPrisma.paymentMethod.findUnique.mockResolvedValue({
      isEnabled: true,
      provider: provider(),
    } as never);
    mockAuthorize.mockResolvedValue({ success: false, failureMessage: "card declined" });

    await expect(
      authorizeOrderPayment({
        orderId: "o1",
        restaurantId: "r1",
        methodType: "VISA",
        methodToken: "pm_123",
        amountCents: 1000,
        currency: "usd",
      }),
    ).rejects.toBeInstanceOf(NoAvailableProviderError);
  });

  it("propagates requiresAction without trying a fallback provider (3DS/SCA, Sprint 07.6 C-6)", async () => {
    mockPrisma.paymentMethod.findUnique.mockResolvedValue({
      isEnabled: true,
      provider: provider({ status: "DISCONNECTED" }),
    } as never);
    mockPrisma.paymentProvider.findMany.mockResolvedValue([provider(), provider({ id: "prov-2", priority: 1 })] as never);
    mockAuthorize.mockResolvedValue({
      success: false,
      providerPaymentIntentId: "pi_123",
      requiresAction: { clientSecret: "pi_123_secret_abc" },
    });
    mockPrisma.payment.upsert.mockResolvedValue({ id: "payment-1", status: "REQUIRES_ACTION" } as never);

    const result = await authorizeOrderPayment({
      orderId: "o1",
      restaurantId: "r1",
      methodType: "VISA",
      methodToken: "pm_123",
      amountCents: 1000,
      currency: "usd",
    });

    expect(result.requiresAction).toEqual({ clientSecret: "pi_123_secret_abc" });
    expect(mockAuthorize).toHaveBeenCalledTimes(1);
    expect(mockPrisma.paymentAttempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "REQUIRES_ACTION" }) }),
    );
    expect(mockPrisma.payment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ status: "REQUIRES_ACTION" }) }),
    );
  });
});

describe("captureOrderPayment", () => {
  function payment(overrides: Record<string, unknown> = {}) {
    return {
      id: "payment-1",
      orderId: "o1",
      provider: provider(),
      successfulAttemptId: "attempt-1",
      authorizedAmountCents: 1000,
      ...overrides,
    };
  }

  it("throws PaymentNotFoundError when the payment doesn't exist", async () => {
    mockPrisma.payment.findUnique.mockResolvedValue(null as never);

    await expect(captureOrderPayment("payment-1", "r1")).rejects.toBeInstanceOf(PaymentNotFoundError);
  });

  it("captures successfully and records a CHARGE transaction", async () => {
    mockPrisma.payment.findUnique.mockResolvedValue(payment() as never);
    mockPrisma.paymentAttempt.findUnique.mockResolvedValue({ providerPaymentIntentId: "pi_123" } as never);
    mockCapture.mockResolvedValue({ success: true, capturedAmountCents: 1000 });
    mockPrisma.payment.update.mockResolvedValue({ id: "payment-1", status: "CAPTURED" } as never);

    const result = await captureOrderPayment("payment-1", "r1");

    expect(result.status).toBe("CAPTURED");
    expect(mockVoid).not.toHaveBeenCalled();
    expect(mockPrisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "CHARGE", amountCents: 1000 }) }),
    );
  });

  it("voids the authorization and marks the Payment VOIDED when capture fails but the void succeeds", async () => {
    mockPrisma.payment.findUnique.mockResolvedValue(payment() as never);
    mockPrisma.paymentAttempt.findUnique.mockResolvedValue({ providerPaymentIntentId: "pi_123" } as never);
    mockCapture.mockResolvedValue({ success: false, failureMessage: "processing error" });
    mockVoid.mockResolvedValue({ success: true });

    await expect(captureOrderPayment("payment-1", "r1")).rejects.toThrow("processing error");

    expect(mockVoid).toHaveBeenCalledWith("pi_123", "sk_test_123");
    expect(mockPrisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "payment-1" }, data: { status: "VOIDED" } }),
    );
    expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
  });

  it("throws PaymentVoidFailedError (not the generic capture error) when both capture AND the compensating void fail", async () => {
    mockPrisma.payment.findUnique.mockResolvedValue(payment() as never);
    mockPrisma.paymentAttempt.findUnique.mockResolvedValue({ providerPaymentIntentId: "pi_123" } as never);
    mockCapture.mockResolvedValue({ success: false, failureMessage: "processing error" });
    mockVoid.mockResolvedValue({ success: false, failureMessage: "intent already expired" });

    await expect(captureOrderPayment("payment-1", "r1")).rejects.toBeInstanceOf(PaymentVoidFailedError);

    expect(mockPrisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "payment-1" }, data: { status: "FAILED" } }),
    );
  });
});

describe("refundOrderPayment", () => {
  it("throws PaymentNotFoundError when the payment has no successful provider charge on record", async () => {
    mockPrisma.payment.findUnique.mockResolvedValue({
      id: "pay-1",
      provider: provider(),
      successfulAttemptId: null,
    } as never);

    await expect(
      refundOrderPayment({
        paymentId: "pay-1",
        amountCents: 500,
        reason: "CUSTOMER_REQUEST",
        restaurantId: "r1",
      }),
    ).rejects.toBeInstanceOf(PaymentNotFoundError);
  });

  it("creates a Refund row and a negative Transaction on success, after atomically reserving the refund amount", async () => {
    mockPrisma.payment.findUnique.mockResolvedValue({
      id: "pay-1",
      orderId: "o1",
      provider: provider(),
      successfulAttemptId: "attempt-1",
      refundedAmountCents: 0,
      capturedAmountCents: 1000,
    } as never);
    mockPrisma.paymentAttempt.findUnique.mockResolvedValue({ providerPaymentIntentId: "pi_123" } as never);
    // The atomic reservation (reserveRefundAmount) succeeds, returning the updated row.
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: "pay-1", refundedAmountCents: 500, capturedAmountCents: 1000, status: "PARTIALLY_REFUNDED" },
    ] as never);
    mockRefund.mockResolvedValue({ success: true, providerRefundId: "re_123" });
    mockPrisma.refund.create.mockResolvedValue({ id: "refund-1", status: "COMPLETED" } as never);

    const refund = await refundOrderPayment({
      paymentId: "pay-1",
      amountCents: 500,
      reason: "CUSTOMER_REQUEST",
      restaurantId: "r1",
    });

    expect(refund.id).toBe("refund-1");
    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1); // reservation, before the provider call
    expect(mockPrisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amountCents: -500, type: "REFUND" }) }),
    );
    // No compensating release on the success path.
    expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("throws RefundFailedError (never returns silently) when the provider rejects the refund, and releases the reservation back", async () => {
    mockPrisma.payment.findUnique.mockResolvedValue({
      id: "pay-1",
      orderId: "o1",
      provider: provider(),
      successfulAttemptId: "attempt-1",
      refundedAmountCents: 0,
      capturedAmountCents: 1000,
    } as never);
    mockPrisma.paymentAttempt.findUnique.mockResolvedValue({ providerPaymentIntentId: "pi_123" } as never);
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: "pay-1", refundedAmountCents: 500, capturedAmountCents: 1000, status: "PARTIALLY_REFUNDED" },
    ] as never);
    mockRefund.mockResolvedValue({ success: false, failureMessage: "already refunded" });
    mockPrisma.refund.create.mockResolvedValue({ id: "refund-1", status: "FAILED" } as never);

    await expect(
      refundOrderPayment({
        paymentId: "pay-1",
        amountCents: 500,
        reason: "CUSTOMER_REQUEST",
        restaurantId: "r1",
      }),
    ).rejects.toBeInstanceOf(RefundFailedError);

    // The FAILED attempt is still recorded for audit purposes...
    expect(mockPrisma.refund.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
    // ...the reservation is released back since the provider never actually moved money...
    expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    // ...and nothing downstream that implies success ever runs.
    expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
  });

  it("throws RefundExceedsRemainingBalanceError before ever calling the provider, when the atomic reservation finds insufficient remaining balance (Sprint 07.7 H-4, now race-safe)", async () => {
    mockPrisma.payment.findUnique.mockResolvedValue({
      id: "pay-1",
      orderId: "o1",
      provider: provider(),
      successfulAttemptId: "attempt-1",
      refundedAmountCents: 600,
      capturedAmountCents: 1000,
    } as never);
    mockPrisma.paymentAttempt.findUnique.mockResolvedValue({ providerPaymentIntentId: "pi_123" } as never);
    // The atomic UPDATE...WHERE clause matches no row: insufficient remaining balance.
    mockPrisma.$queryRaw.mockResolvedValue([] as never);

    await expect(
      refundOrderPayment({
        paymentId: "pay-1",
        amountCents: 500, // remaining is only 400
        reason: "CUSTOMER_REQUEST",
        restaurantId: "r1",
      }),
    ).rejects.toBeInstanceOf(RefundExceedsRemainingBalanceError);

    expect(mockRefund).not.toHaveBeenCalled();
    expect(mockPrisma.refund.create).not.toHaveBeenCalled();
  });

  it("succeeds when the refund amount exactly equals the remaining balance (boundary case)", async () => {
    mockPrisma.payment.findUnique.mockResolvedValue({
      id: "pay-1",
      orderId: "o1",
      provider: provider(),
      successfulAttemptId: "attempt-1",
      refundedAmountCents: 600,
      capturedAmountCents: 1000,
    } as never);
    mockPrisma.paymentAttempt.findUnique.mockResolvedValue({ providerPaymentIntentId: "pi_123" } as never);
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: "pay-1", refundedAmountCents: 1000, capturedAmountCents: 1000, status: "REFUNDED" },
    ] as never);
    mockRefund.mockResolvedValue({ success: true, providerRefundId: "re_123" });
    mockPrisma.refund.create.mockResolvedValue({ id: "refund-1", status: "COMPLETED" } as never);

    const refund = await refundOrderPayment({
      paymentId: "pay-1",
      amountCents: 400, // remaining is exactly 400
      reason: "CUSTOMER_REQUEST",
      restaurantId: "r1",
    });

    expect(refund.id).toBe("refund-1");
    expect(mockRefund).toHaveBeenCalledWith("pi_123", 400, expect.any(String));
  });

  it("closes the two-concurrent-refund race: a second concurrent refund whose reservation observes the balance already consumed is rejected, never double-charging the provider", async () => {
    mockPrisma.payment.findUnique.mockResolvedValue({
      id: "pay-1",
      orderId: "o1",
      provider: provider(),
      successfulAttemptId: "attempt-1",
      refundedAmountCents: 0,
      capturedAmountCents: 1000,
    } as never);
    mockPrisma.paymentAttempt.findUnique.mockResolvedValue({ providerPaymentIntentId: "pi_123" } as never);
    // Simulates Postgres's own row-level serialization: the first
    // concurrent call's atomic UPDATE commits and consumes the full
    // balance; the second call's atomic UPDATE (evaluated against the
    // now-committed row) matches no row.
    mockPrisma.$queryRaw
      .mockResolvedValueOnce([
        { id: "pay-1", refundedAmountCents: 1000, capturedAmountCents: 1000, status: "REFUNDED" },
      ] as never)
      .mockResolvedValueOnce([] as never);
    mockRefund.mockResolvedValue({ success: true, providerRefundId: "re_123" });
    mockPrisma.refund.create.mockResolvedValue({ id: "refund-1", status: "COMPLETED" } as never);

    const first = await refundOrderPayment({
      paymentId: "pay-1",
      amountCents: 1000,
      reason: "CUSTOMER_REQUEST",
      restaurantId: "r1",
    });
    expect(first.id).toBe("refund-1");

    await expect(
      refundOrderPayment({
        paymentId: "pay-1",
        amountCents: 1000,
        reason: "CUSTOMER_REQUEST",
        restaurantId: "r1",
      }),
    ).rejects.toBeInstanceOf(RefundExceedsRemainingBalanceError);

    // The provider's refund API was only ever called once — the second
    // concurrent attempt never reached it.
    expect(mockRefund).toHaveBeenCalledTimes(1);
  });
});
