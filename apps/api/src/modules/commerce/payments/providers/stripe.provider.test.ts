import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreate, mockCapture, mockCancel, mockRefundsCreate, mockRetrieve, mockConstructEvent } = vi.hoisted(
  () => ({
    mockCreate: vi.fn(),
    mockCapture: vi.fn(),
    mockCancel: vi.fn(),
    mockRefundsCreate: vi.fn(),
    mockRetrieve: vi.fn(),
    mockConstructEvent: vi.fn(),
  }),
);

vi.mock("stripe", () => {
  class MockStripe {
    paymentIntents = { create: mockCreate, capture: mockCapture, cancel: mockCancel, retrieve: mockRetrieve };
    refunds = { create: mockRefundsCreate };
    static webhooks = { constructEvent: mockConstructEvent };
    static errors = { StripeError: class StripeError extends Error {} };
  }
  return { default: MockStripe };
});

import { StripePaymentProviderAdapter } from "./stripe.provider";

const adapter = new StripePaymentProviderAdapter();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("StripePaymentProviderAdapter", () => {
  it("is marked implemented", () => {
    expect(adapter.implemented).toBe(true);
    expect(adapter.providerType).toBe("STRIPE");
  });

  it("authorize() succeeds on requires_capture", async () => {
    mockCreate.mockResolvedValue({ id: "pi_1", status: "requires_capture" });

    const result = await adapter.authorize(
      { orderId: "o1", amountCents: 1000, currency: "usd", methodToken: "pm_1" },
      "sk_test_123",
    );

    expect(result).toEqual({ success: true, providerPaymentIntentId: "pi_1" });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 1000, currency: "usd", capture_method: "manual" }),
    );
  });

  it("authorize() returns a requiresAction result (not a failure) on requires_action (Sprint 07.6 C-6)", async () => {
    mockCreate.mockResolvedValue({ id: "pi_3", status: "requires_action", client_secret: "pi_3_secret_xyz" });

    const result = await adapter.authorize(
      { orderId: "o1", amountCents: 1000, currency: "usd", methodToken: "pm_1" },
      "sk_test_123",
    );

    expect(result.success).toBe(false);
    expect(result.requiresAction).toEqual({ clientSecret: "pi_3_secret_xyz" });
    expect(result.providerPaymentIntentId).toBe("pi_3");
  });

  it("authorize() returns a structured failure on decline, without throwing", async () => {
    mockCreate.mockResolvedValue({
      id: "pi_2",
      status: "requires_payment_method",
      last_payment_error: { code: "card_declined", message: "Your card was declined." },
    });

    const result = await adapter.authorize(
      { orderId: "o1", amountCents: 1000, currency: "usd", methodToken: "pm_1" },
      "sk_test_123",
    );

    expect(result.success).toBe(false);
    expect(result.failureCode).toBe("card_declined");
  });

  it("capture() reports success with the captured amount", async () => {
    mockCapture.mockResolvedValue({ status: "succeeded", amount_received: 1000 });

    const result = await adapter.capture("pi_1", undefined, "sk_test_123");

    expect(result).toEqual({ success: true, capturedAmountCents: 1000 });
  });

  it("refund() reports success with the provider refund id", async () => {
    mockRefundsCreate.mockResolvedValue({ id: "re_1", status: "succeeded" });

    const result = await adapter.refund("pi_1", 500, "sk_test_123");

    expect(result).toEqual({ success: true, providerRefundId: "re_1" });
  });

  it("verifyWebhookSignature returns false on a bad signature instead of throwing", () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("signature mismatch");
    });

    expect(adapter.verifyWebhookSignature("{}", "bad-sig", "whsec_1")).toBe(false);
  });

  it("verifyWebhookSignature returns true when constructEvent succeeds", () => {
    mockConstructEvent.mockReturnValue({ id: "evt_1" });

    expect(adapter.verifyWebhookSignature("{}", "good-sig", "whsec_1")).toBe(true);
  });

  it("parseWebhookEvent maps payment_intent.succeeded to captured", () => {
    const event = {
      id: "evt_1",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_1", status: "succeeded" } },
    };

    expect(adapter.parseWebhookEvent(event)).toEqual({
      externalEventId: "evt_1",
      providerPaymentIntentId: "pi_1",
      status: "captured",
      raw: event,
    });
  });
});
