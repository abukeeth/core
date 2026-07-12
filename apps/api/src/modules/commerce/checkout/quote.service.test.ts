import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    restaurant: { findUnique: vi.fn() },
    restaurantHours: { findMany: vi.fn(() => []) },
    deliveryZone: { findMany: vi.fn(() => []) },
    deliveryRule: { findMany: vi.fn(() => []) },
    order: { count: vi.fn(() => 0) },
    tax: { findMany: vi.fn(() => []) },
    deliveryFeeRule: { findMany: vi.fn(() => []) },
    serviceFeeRule: { findMany: vi.fn(() => []) },
    customerAddress: { findFirst: vi.fn() },
  },
}));

vi.mock("../fulfillment/fulfillment.service", () => ({
  countActiveDriverAssignments: vi.fn(async () => 0),
}));

vi.mock("../delivery-rules/delivery-config.service", () => ({
  getConfig: vi.fn(async () => ({
    id: "dc1",
    restaurantId: "r1",
    isDeliveryEnabled: true,
    isPickupEnabled: true,
    isDineInEnabled: true,
    deliveryRadiusMiles: 10,
    maxDeliveryDistanceMiles: 25,
    minOrderCentsForDelivery: 0,
    minOrderCentsForPickup: 0,
  })),
}));

vi.mock("../delivery-rules/kitchen-capacity.service", () => ({
  getCapacity: vi.fn(async () => ({ isAcceptingOrders: true, maxConcurrentOrders: null })),
  isKitchenAvailable: vi.fn(() => true),
}));

vi.mock("../delivery-rules/hours.service", () => ({
  isRestaurantOpenAt: vi.fn(() => true),
}));

vi.mock("../coupons/coupons.service", () => ({
  validateCouponForRedemption: vi.fn(),
}));

import { prisma } from "../../../lib/prisma";
import { validateCouponForRedemption } from "../coupons/coupons.service";
import { computeCheckoutQuote } from "./quote.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.restaurant.findUnique.mockResolvedValue({ id: "r1", lat: 41.8, lng: -87.6 } as never);
  mockPrisma.restaurantHours.findMany.mockResolvedValue([] as never);
  mockPrisma.deliveryZone.findMany.mockResolvedValue([] as never);
  mockPrisma.deliveryRule.findMany.mockResolvedValue([] as never);
  mockPrisma.order.count.mockResolvedValue(0 as never);
  mockPrisma.tax.findMany.mockResolvedValue([] as never);
  mockPrisma.deliveryFeeRule.findMany.mockResolvedValue([] as never);
  mockPrisma.serviceFeeRule.findMany.mockResolvedValue([] as never);
});

function cart(overrides: Record<string, unknown> = {}) {
  return {
    id: "cart-1",
    restaurantId: "r1",
    fulfillmentType: "PICKUP",
    scheduledFor: null,
    deliveryAddressId: null,
    couponCode: null,
    customerId: null,
    items: [{ unitPriceCents: 1000, quantity: 2 }],
    ...overrides,
  } as never;
}

describe("computeCheckoutQuote", () => {
  it("is ineligible when the restaurant does not exist", async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue(null as never);
    const quote = await computeCheckoutQuote(cart(), 0);
    expect(quote.eligible).toBe(false);
  });

  it("is ineligible when the restaurant is suspended by a platform admin, regardless of hours/capacity", async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue({ id: "r1", lat: 41.8, lng: -87.6, isSuspended: true } as never);
    const quote = await computeCheckoutQuote(cart(), 0);
    expect(quote.eligible).toBe(false);
    expect(quote.reason).toMatch(/temporarily unavailable/i);
  });

  it("computes subtotal correctly from cart items", async () => {
    const quote = await computeCheckoutQuote(cart(), 0);
    expect(quote.subtotalCents).toBe(2000);
  });

  it("is eligible for pickup with zero delivery/service fees by default", async () => {
    const quote = await computeCheckoutQuote(cart(), 0);
    expect(quote.eligible).toBe(true);
    expect(quote.deliveryFeeCents).toBe(0);
    expect(quote.totalCents).toBe(2000);
  });

  it("includes tipCents in the total", async () => {
    const quote = await computeCheckoutQuote(cart(), 500);
    expect(quote.tipCents).toBe(500);
    expect(quote.totalCents).toBe(2500);
  });

  it("is ineligible for delivery when the address has no geocoded location", async () => {
    mockPrisma.customerAddress.findFirst.mockResolvedValue({ id: "addr-1", lat: null, lng: null } as never);
    const quote = await computeCheckoutQuote(cart({ customerId: "c1", fulfillmentType: "DELIVERY", deliveryAddressId: "addr-1" }), 0);
    expect(quote.eligible).toBe(false);
  });

  it("is ineligible for delivery when the address doesn't belong to the cart's own customer (scoped lookup finds nothing)", async () => {
    mockPrisma.customerAddress.findFirst.mockResolvedValue(null as never);
    const quote = await computeCheckoutQuote(cart({ customerId: "c1", fulfillmentType: "DELIVERY", deliveryAddressId: "someone-elses-addr" }), 0);
    expect(quote.eligible).toBe(false);
    expect(mockPrisma.customerAddress.findFirst).toHaveBeenCalledWith({ where: { id: "someone-elses-addr", customerId: "c1" } });
  });

  it("is ineligible for delivery on a guest cart (no customerId), without even querying for the address", async () => {
    const quote = await computeCheckoutQuote(cart({ customerId: null, fulfillmentType: "DELIVERY", deliveryAddressId: "addr-1" }), 0);
    expect(quote.eligible).toBe(false);
    expect(mockPrisma.customerAddress.findFirst).not.toHaveBeenCalled();
  });

  it("applies a PERCENTAGE coupon as a discount", async () => {
    vi.mocked(validateCouponForRedemption).mockResolvedValue({
      coupon: { type: "PERCENTAGE" } as never,
      discountCents: 300,
    });
    const quote = await computeCheckoutQuote(cart({ couponCode: "SAVE10" }), 0);
    expect(quote.discountCents).toBe(300);
    expect(quote.totalCents).toBe(1700);
  });

  it("zeroes the delivery fee (not discountCents) for a FREE_DELIVERY coupon", async () => {
    vi.mocked(validateCouponForRedemption).mockResolvedValue({
      coupon: { type: "FREE_DELIVERY" } as never,
      discountCents: 0,
    });
    const quote = await computeCheckoutQuote(cart({ couponCode: "FREESHIP" }), 0);
    expect(quote.discountCents).toBe(0);
  });

  it("silently drops an invalid coupon rather than blocking the quote", async () => {
    vi.mocked(validateCouponForRedemption).mockRejectedValue(new Error("expired"));
    const quote = await computeCheckoutQuote(cart({ couponCode: "EXPIRED" }), 0);
    expect(quote.eligible).toBe(true);
    expect(quote.discountCents).toBe(0);
  });

  describe("zone geometry threading (C-12)", () => {
    const zone = {
      id: "zone-1",
      restaurantId: "r1",
      name: "Downtown",
      geometry: { type: "radius", centerLat: 41.8, centerLng: -87.6, radiusMiles: 1 },
    };
    const zoneScopedRule = {
      id: "rule-1",
      restaurantId: "r1",
      zoneId: "zone-1",
      minDistanceMiles: 0,
      maxDistanceMiles: 50,
      fulfillmentMethod: "RESTAURANT_DRIVER",
      priority: 0,
      fallbackToRuleId: null,
      isActive: true,
    };

    beforeEach(() => {
      mockPrisma.deliveryZone.findMany.mockResolvedValue([zone] as never);
      mockPrisma.deliveryRule.findMany.mockResolvedValue([zoneScopedRule] as never);
    });

    it("passes the delivery address's own lat/lng through to the zone containment check — eligible when inside the zone", async () => {
      mockPrisma.customerAddress.findFirst.mockResolvedValue({ id: "addr-1", lat: 41.8005, lng: -87.6 } as never);

      const quote = await computeCheckoutQuote(cart({ customerId: "c1", fulfillmentType: "DELIVERY", deliveryAddressId: "addr-1" }), 0);

      expect(quote.eligible).toBe(true);
      expect(quote.resolvedFulfillmentMethod).toBe("RESTAURANT_DRIVER");
    });

    it("rejects when the address's lat/lng falls outside the zone-scoped rule's polygon/radius", async () => {
      mockPrisma.customerAddress.findFirst.mockResolvedValue({ id: "addr-1", lat: 42.5, lng: -87.6 } as never);

      const quote = await computeCheckoutQuote(cart({ customerId: "c1", fulfillmentType: "DELIVERY", deliveryAddressId: "addr-1" }), 0);

      expect(quote.eligible).toBe(false);
    });
  });
});
