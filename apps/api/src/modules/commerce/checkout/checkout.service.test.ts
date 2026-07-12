import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    menuItem: { findUnique: vi.fn(), findMany: vi.fn() },
    menuItemInventory: { findUnique: vi.fn() },
    menuItemVariant: { findUnique: vi.fn() },
    restaurant: { findUnique: vi.fn() },
    user: { findFirst: vi.fn() },
    customer: { findUnique: vi.fn() },
    order: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    orderItem: { findMany: vi.fn(), update: vi.fn() },
    orderTimeline: { create: vi.fn() },
    transaction: { createMany: vi.fn() },
    guestCustomer: { create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
    couponRedemption: { create: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    cart: { update: vi.fn() },
    payment: { findUnique: vi.fn() },
  },
}));

vi.mock("../cart/cart.service", () => ({
  getCartWithItems: vi.fn(),
  cartSubtotalCents: vi.fn(() => 1000),
}));

vi.mock("../menu-commerce/inventory.service", () => ({
  isItemOrderable: vi.fn(() => true),
}));

const mockAuthorize = vi.fn();
const mockCapture = vi.fn();
vi.mock("../payments/orchestrator", () => ({
  authorizeOrderPayment: (...args: unknown[]) => mockAuthorize(...args),
  captureOrderPayment: (...args: unknown[]) => mockCapture(...args),
}));

vi.mock("../coupons/coupons.service", () => ({
  validateCouponForRedemption: vi.fn(),
}));

vi.mock("../events/record-order-event", () => ({
  emitOrderEvent: vi.fn(),
  writeOrderEvent: vi.fn(),
}));

vi.mock("../orders/order-number", () => ({
  nextOrderNumber: vi.fn(async () => 1),
}));

vi.mock("../notifications/notifications.service", () => ({
  sendNewOrderStaffAlert: vi.fn(),
  sendOrderConfirmation: vi.fn(),
  sendPaymentFailedNotification: vi.fn(),
}));

vi.mock("./quote.service", () => ({
  computeCheckoutQuote: vi.fn(),
}));

import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { getCartWithItems } from "../cart/cart.service";
import { validateCouponForRedemption } from "../coupons/coupons.service";
import { sendOrderConfirmation } from "../notifications/notifications.service";
import { NoAvailableProviderError } from "../payments/payments.errors";
import { computeCheckoutQuote } from "./quote.service";
import {
  CheckoutIneligibleError,
  EmptyCartError,
  GuestInfoRequiredError,
  PaymentFailedError,
  PriceDriftError,
} from "./checkout.errors";
import { confirmCardPayment, placeOrder } from "./checkout.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

function eligibleQuote(overrides: Record<string, unknown> = {}) {
  return {
    eligible: true,
    resolvedFulfillmentMethod: "PICKUP",
    subtotalCents: 1000,
    taxCents: 90,
    tipCents: 0,
    deliveryFeeCents: 0,
    serviceFeeCents: 0,
    discountCents: 0,
    totalCents: 1090,
    ...overrides,
  };
}

function baseCart(overrides: Record<string, unknown> = {}) {
  return {
    id: "cart-1",
    restaurantId: "r1",
    customerId: "cust-1",
    guestSessionId: null,
    status: "ACTIVE",
    couponCode: null,
    fulfillmentType: "PICKUP",
    tableId: null,
    scheduledFor: null,
    deliveryAddressId: null,
    items: [
      {
        id: "ci-1",
        cartId: "cart-1",
        menuItemId: "item-1",
        variantId: null,
        quantity: 1,
        unitPriceCents: 1000,
        modifiersSnapshot: { modifiers: [] },
      },
    ],
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (cb: unknown) => (cb as (tx: unknown) => unknown)(mockPrisma));
  mockPrisma.menuItem.findUnique.mockResolvedValue({ id: "item-1", name: "Burger", restaurantId: "r1", priceCents: 1000, isAvailable: true } as never);
  mockPrisma.menuItem.findMany.mockResolvedValue([{ id: "item-1", name: "Burger" }] as never);
  mockPrisma.menuItemInventory.findUnique.mockResolvedValue(null as never);
  mockPrisma.restaurant.findUnique.mockResolvedValue({ id: "r1", ownerId: "owner-1" } as never);
  mockPrisma.user.findFirst.mockResolvedValue({ email: "owner@restaurant.com" } as never);
  mockPrisma.customer.findUnique.mockResolvedValue({ email: "customer@example.com" } as never);
  mockPrisma.guestCustomer.findFirst.mockResolvedValue(null as never);
  mockPrisma.orderItem.findMany.mockResolvedValue([{ id: "oi-1", menuItemId: "item-1" }] as never);
  mockPrisma.order.findUniqueOrThrow.mockResolvedValue({
    id: "order-1",
    orderNumber: 1,
    status: "PENDING_PAYMENT",
    totalCents: 1090,
  } as never);
  mockPrisma.order.findUnique.mockResolvedValue({
    id: "order-1",
    orderNumber: 1,
    status: "PENDING_PAYMENT",
    totalCents: 1090,
  } as never);
  vi.mocked(computeCheckoutQuote).mockResolvedValue(eligibleQuote() as never);
});

function mockCreatedOrder(overrides: Record<string, unknown> = {}) {
  mockPrisma.order.create = vi.fn().mockResolvedValue({
    id: "order-1",
    orderNumber: 1,
    restaurantId: "r1",
    status: "PENDING_PAYMENT",
    totalCents: 1090,
    ...overrides,
  } as never) as never;
  mockPrisma.orderItem.createMany = vi.fn().mockResolvedValue({ count: 1 } as never) as never;
  mockPrisma.fulfillment = { create: vi.fn().mockResolvedValue({}) } as never;
}

describe("placeOrder — pre-flight validation", () => {
  it("rejects a cart that does not belong to the given restaurant", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(baseCart({ restaurantId: "other" }));

    await expect(
      placeOrder("cart-1", "r1", { tipCents: 0, methodType: "CASH_AT_PICKUP" } as never),
    ).rejects.toBeInstanceOf(CheckoutIneligibleError);
  });

  it("rejects an empty cart", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(baseCart({ items: [] }));

    await expect(
      placeOrder("cart-1", "r1", { tipCents: 0, methodType: "CASH_AT_PICKUP" } as never),
    ).rejects.toBeInstanceOf(EmptyCartError);
  });

  it("rejects a guest checkout with no guest email", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(baseCart({ customerId: null }));

    await expect(
      placeOrder("cart-1", "r1", { tipCents: 0, methodType: "CASH_AT_PICKUP" } as never),
    ).rejects.toBeInstanceOf(GuestInfoRequiredError);
  });

  it("rejects when the base item price has drifted since it was added to the cart", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(baseCart());
    mockPrisma.menuItem.findUnique.mockResolvedValue({ id: "item-1", name: "Burger", restaurantId: "r1", priceCents: 1500, isAvailable: true } as never);

    await expect(
      placeOrder("cart-1", "r1", { tipCents: 0, methodType: "CASH_AT_PICKUP" } as never),
    ).rejects.toBeInstanceOf(PriceDriftError);
  });

  it("rejects when the routing engine reports the order ineligible", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(baseCart());
    vi.mocked(computeCheckoutQuote).mockResolvedValue({ eligible: false, reason: "Restaurant is closed" } as never);

    await expect(
      placeOrder("cart-1", "r1", { tipCents: 0, methodType: "CASH_AT_PICKUP" } as never),
    ).rejects.toBeInstanceOf(CheckoutIneligibleError);
  });

  it("rejects a cart that has already been converted by a prior placeOrder call", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(baseCart({ status: "CONVERTED" }));

    await expect(
      placeOrder("cart-1", "r1", { tipCents: 0, methodType: "CASH_AT_PICKUP" } as never),
    ).rejects.toBeInstanceOf(CheckoutIneligibleError);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("maps a concurrent double-checkout (P2002 on Order.cartId) to CheckoutIneligibleError", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(baseCart());
    mockCreatedOrder();
    mockPrisma.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["cartId"] },
      }),
    );

    await expect(
      placeOrder("cart-1", "r1", { tipCents: 0, methodType: "CASH_AT_PICKUP" } as never),
    ).rejects.toBeInstanceOf(CheckoutIneligibleError);
  });
});

describe("placeOrder — guest customer identity (Sprint 07.7 H-5)", () => {
  it("reuses an existing GuestCustomer row found by email instead of creating a duplicate", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(baseCart({ customerId: null }));
    mockCreatedOrder();
    mockPrisma.guestCustomer.findFirst.mockResolvedValue({ id: "guest-existing", email: "guest@example.com" } as never);

    await placeOrder("cart-1", "r1", {
      tipCents: 0,
      methodType: "CASH_AT_PICKUP",
      guestEmail: "guest@example.com",
      guestName: "Guest Person",
    } as never);

    expect(mockPrisma.guestCustomer.create).not.toHaveBeenCalled();
    expect(mockPrisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ guestCustomerId: "guest-existing" }) }),
    );
  });

  it("creates a new GuestCustomer row when no existing one matches the email", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(baseCart({ customerId: null }));
    mockCreatedOrder();
    mockPrisma.guestCustomer.findFirst.mockResolvedValue(null as never);
    mockPrisma.guestCustomer.create = vi.fn().mockResolvedValue({ id: "guest-new" } as never) as never;

    await placeOrder("cart-1", "r1", {
      tipCents: 0,
      methodType: "CASH_AT_PICKUP",
      guestEmail: "new-guest@example.com",
      guestName: "New Guest",
    } as never);

    expect(mockPrisma.guestCustomer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: "new-guest@example.com" }) }),
    );
    expect(mockPrisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ guestCustomerId: "guest-new" }) }),
    );
  });

  it("rejects a coupon once the resolved guest has hit their per-customer redemption cap", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(baseCart({ customerId: null, couponCode: "SAVE10" }));
    mockCreatedOrder();
    mockPrisma.guestCustomer.findFirst.mockResolvedValue({ id: "guest-existing", email: "guest@example.com" } as never);
    vi.mocked(validateCouponForRedemption).mockResolvedValue({
      coupon: { id: "coupon-1", maxRedemptions: null, maxRedemptionsPerCustomer: 1 } as never,
      discountCents: 100,
    });
    mockPrisma.couponRedemption.count.mockResolvedValueOnce(1);

    await expect(
      placeOrder("cart-1", "r1", {
        tipCents: 0,
        methodType: "CASH_AT_PICKUP",
        guestEmail: "guest@example.com",
        guestName: "Guest Person",
      } as never),
    ).rejects.toBeInstanceOf(CheckoutIneligibleError);

    expect(validateCouponForRedemption).toHaveBeenCalledWith("r1", "SAVE10", 1000, undefined, "guest-existing");
  });
});

describe("placeOrder — cash methods bypass the payment provider", () => {
  it("creates and confirms the order without calling authorizeOrderPayment", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(baseCart());
    mockCreatedOrder();

    await placeOrder("cart-1", "r1", { tipCents: 0, methodType: "CASH_AT_PICKUP" } as never);

    expect(mockAuthorize).not.toHaveBeenCalled();
    expect(mockPrisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CONFIRMED" }) }),
    );
  });
});

describe("placeOrder — card payment success", () => {
  it("authorizes, captures, confirms the order, and writes sub-ledger transactions", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(baseCart());
    mockCreatedOrder({ tipCents: 200, serviceFeeCents: 100 });
    mockAuthorize.mockResolvedValue({ payment: { id: "pay-1" }, attempt: { id: "attempt-1" } });
    mockCapture.mockResolvedValue({ id: "pay-1", status: "CAPTURED" });
    vi.mocked(computeCheckoutQuote).mockResolvedValue(eligibleQuote({ tipCents: 200, serviceFeeCents: 100, totalCents: 1390 }) as never);

    const result = await placeOrder("cart-1", "r1", { tipCents: 200, methodType: "VISA", methodToken: "pm_123" } as never);

    expect(mockAuthorize).toHaveBeenCalledWith(expect.objectContaining({ orderId: "order-1", amountCents: 1390 }));
    expect(mockCapture).toHaveBeenCalledWith("pay-1", "r1");
    expect(mockPrisma.transaction.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ type: "TIP", amountCents: 200 }),
          expect.objectContaining({ type: "SERVICE_FEE", amountCents: 100 }),
        ]),
      }),
    );
    expect(result.order.id).toBe("order-1");
  });

  it("rejects a card method with no methodToken before ever creating a payment attempt", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(baseCart());
    mockCreatedOrder();

    await expect(
      placeOrder("cart-1", "r1", { tipCents: 0, methodType: "VISA" } as never),
    ).rejects.toBeInstanceOf(PaymentFailedError);
    expect(mockAuthorize).not.toHaveBeenCalled();
  });

  it("does not throw when the post-capture confirmOrder transition fails (capture has already succeeded)", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(baseCart());
    mockCreatedOrder();
    mockAuthorize.mockResolvedValue({ payment: { id: "pay-1" }, attempt: { id: "attempt-1" } });
    mockCapture.mockResolvedValue({ id: "pay-1", status: "CAPTURED" });
    // confirmOrder internally calls order.findUniqueOrThrow — make that
    // specific post-capture lookup fail to simulate a DB hiccup after money
    // has already moved.
    mockPrisma.order.findUniqueOrThrow.mockRejectedValue(new Error("db hiccup"));

    const result = await placeOrder("cart-1", "r1", { tipCents: 0, methodType: "VISA", methodToken: "pm_123" } as never);

    expect(result.order.id).toBe("order-1");
    // Crucially: failOrder must NOT have been invoked as a result of this
    // post-capture failure (that would incorrectly mark a paid order FAILED).
    expect(mockPrisma.order.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
  });

  it("does not throw when the post-capture order confirmation email fails", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(baseCart());
    mockCreatedOrder();
    mockAuthorize.mockResolvedValue({ payment: { id: "pay-1" }, attempt: { id: "attempt-1" } });
    mockCapture.mockResolvedValue({ id: "pay-1", status: "CAPTURED" });
    vi.mocked(sendOrderConfirmation).mockRejectedValue(new Error("email provider down"));

    const result = await placeOrder("cart-1", "r1", { tipCents: 0, methodType: "VISA", methodToken: "pm_123" } as never);

    expect(result.order.id).toBe("order-1");
  });
});

describe("placeOrder — card payment failure", () => {
  it("transitions the order to FAILED, notifies the customer, and throws PaymentFailedError", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(baseCart());
    mockCreatedOrder();
    mockAuthorize.mockRejectedValue(new NoAvailableProviderError("all providers declined"));

    await expect(
      placeOrder("cart-1", "r1", { tipCents: 0, methodType: "VISA", methodToken: "pm_123" } as never),
    ).rejects.toBeInstanceOf(PaymentFailedError);

    expect(mockPrisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
    expect(mockCapture).not.toHaveBeenCalled();
  });
});

describe("placeOrder — coupon redemption race", () => {
  it("rejects when the in-transaction recount finds the global cap already reached", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(baseCart({ couponCode: "SAVE10" }));
    mockCreatedOrder();
    vi.mocked(validateCouponForRedemption).mockResolvedValue({
      coupon: { id: "coupon-1", maxRedemptions: 5, maxRedemptionsPerCustomer: null } as never,
      discountCents: 100,
    });
    mockPrisma.couponRedemption.count.mockResolvedValueOnce(5);

    await expect(
      placeOrder("cart-1", "r1", { tipCents: 0, methodType: "CASH_AT_PICKUP" } as never),
    ).rejects.toBeInstanceOf(CheckoutIneligibleError);
  });

  it("rejects when the in-transaction recount finds the per-customer cap already reached", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(baseCart({ couponCode: "SAVE10" }));
    mockCreatedOrder();
    vi.mocked(validateCouponForRedemption).mockResolvedValue({
      coupon: { id: "coupon-1", maxRedemptions: null, maxRedemptionsPerCustomer: 1 } as never,
      discountCents: 100,
    });
    mockPrisma.couponRedemption.count.mockResolvedValueOnce(1);

    await expect(
      placeOrder("cart-1", "r1", { tipCents: 0, methodType: "CASH_AT_PICKUP" } as never),
    ).rejects.toBeInstanceOf(CheckoutIneligibleError);
  });

  it("maps a Postgres serialization failure (P2034) to CheckoutIneligibleError", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(baseCart({ couponCode: "SAVE10" }));
    mockCreatedOrder();
    vi.mocked(validateCouponForRedemption).mockResolvedValue({
      coupon: { id: "coupon-1", maxRedemptions: 5, maxRedemptionsPerCustomer: null } as never,
      discountCents: 100,
    });
    mockPrisma.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Transaction failed due to a write conflict", {
        code: "P2034",
        clientVersion: "test",
      }),
    );

    await expect(
      placeOrder("cart-1", "r1", { tipCents: 0, methodType: "CASH_AT_PICKUP" } as never),
    ).rejects.toBeInstanceOf(CheckoutIneligibleError);
  });

  it("runs the transaction with Serializable isolation when a coupon is present", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(baseCart({ couponCode: "SAVE10" }));
    mockCreatedOrder();
    vi.mocked(validateCouponForRedemption).mockResolvedValue({
      coupon: { id: "coupon-1", maxRedemptions: 5, maxRedemptionsPerCustomer: null } as never,
      discountCents: 100,
    });

    await placeOrder("cart-1", "r1", { tipCents: 0, methodType: "CASH_AT_PICKUP" } as never);

    expect(mockPrisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
    );
  });
});

describe("placeOrder — 3DS/SCA requiresAction (C-6)", () => {
  it("returns requiresAction without capturing or confirming when authorizeOrderPayment requires a challenge", async () => {
    vi.mocked(getCartWithItems).mockResolvedValue(baseCart());
    mockCreatedOrder();
    mockAuthorize.mockResolvedValue({
      payment: { id: "pay-1" },
      attempt: { id: "attempt-1" },
      requiresAction: { clientSecret: "pi_123_secret_abc" },
    });
    mockPrisma.order.findUnique.mockResolvedValue({ id: "order-1", orderNumber: 1, paymentStatus: "REQUIRES_ACTION" } as never);

    const result = await placeOrder("cart-1", "r1", { tipCents: 0, methodType: "VISA", methodToken: "pm_123" } as never);

    expect(result.requiresAction).toEqual({ clientSecret: "pi_123_secret_abc" });
    expect(mockCapture).not.toHaveBeenCalled();
    expect(mockPrisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentStatus: "REQUIRES_ACTION" }) }),
    );
    expect(sendOrderConfirmation).not.toHaveBeenCalled();
  });
});

describe("confirmCardPayment (C-6)", () => {
  it("rejects a cart/order that does not belong to this restaurant", async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ id: "order-1", restaurantId: "other" } as never);

    await expect(confirmCardPayment("cart-1", "r1")).rejects.toBeInstanceOf(CheckoutIneligibleError);
  });

  it("rejects an order that is not awaiting payment confirmation", async () => {
    mockPrisma.order.findUnique.mockResolvedValue({ id: "order-1", restaurantId: "r1", paymentStatus: "PAID" } as never);

    await expect(confirmCardPayment("cart-1", "r1")).rejects.toBeInstanceOf(CheckoutIneligibleError);
    expect(mockCapture).not.toHaveBeenCalled();
  });

  it("captures and completes the order once the 3DS challenge has been completed", async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: "order-1",
      restaurantId: "r1",
      cartId: "cart-1",
      orderNumber: 7,
      paymentStatus: "REQUIRES_ACTION",
      tipCents: 0,
      serviceFeeCents: 0,
      totalCents: 1090,
      customerId: null,
      guestCustomerId: null,
    } as never);
    mockPrisma.payment.findUnique.mockResolvedValue({ id: "pay-1" } as never);
    mockCapture.mockResolvedValue({ id: "pay-1", status: "CAPTURED" });

    const result = await confirmCardPayment("cart-1", "r1");

    expect(mockCapture).toHaveBeenCalledWith("pay-1", "r1");
    expect(mockPrisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CONFIRMED" }) }),
    );
    expect(result.order.id).toBe("order-1");
  });

  it("throws PaymentFailedError (and marks the order FAILED) when the resumed capture fails", async () => {
    mockPrisma.order.findUnique.mockResolvedValue({
      id: "order-1",
      restaurantId: "r1",
      cartId: "cart-1",
      orderNumber: 7,
      paymentStatus: "REQUIRES_ACTION",
      status: "PENDING_PAYMENT",
      customerId: null,
      guestCustomerId: null,
    } as never);
    mockPrisma.payment.findUnique.mockResolvedValue({ id: "pay-1" } as never);
    mockCapture.mockRejectedValue(new Error("capture failed"));

    await expect(confirmCardPayment("cart-1", "r1")).rejects.toBeInstanceOf(PaymentFailedError);
    expect(mockPrisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
  });
});
