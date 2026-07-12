import type { Cart, CartItem, FulfillmentMethod } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { validateCouponForRedemption } from "../coupons/coupons.service";
import { computeRedemptionDiscountCents, getAccountSummary } from "../loyalty/loyalty.service";
import { countActiveDriverAssignments } from "../fulfillment/fulfillment.service";
import { getConfig } from "../delivery-rules/delivery-config.service";
import { resolveDeliveryFeeCents, resolveServiceFeeCents } from "../delivery-rules/fee-rules.service";
import { isRestaurantOpenAt } from "../delivery-rules/hours.service";
import { getCapacity, isKitchenAvailable } from "../delivery-rules/kitchen-capacity.service";
import { distanceMilesBetween } from "../delivery-rules/geometry";
import { evaluateRouting } from "../delivery-rules/smart-routing";
import { computeTaxCents } from "./tax";
import { cartSubtotalCents } from "../cart/cart.service";

export interface CheckoutQuote {
  eligible: boolean;
  reason?: string;
  resolvedFulfillmentMethod?: FulfillmentMethod;
  distanceMiles?: number;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  deliveryFeeCents: number;
  serviceFeeCents: number;
  discountCents: number;
  totalCents: number;
}

const ACTIVE_ORDER_STATUSES = ["CONFIRMED", "PREPARING"] as const;

/**
 * Computed fresh on every call, never persisted or cached — deliberately
 * simpler than a cached "quote lock with expiry" scheme, and more
 * correct: there is no stale quote to accidentally honor, since
 * placeOrder always recomputes this same function immediately before
 * charging the customer.
 */
export async function computeCheckoutQuote(
  cart: Cart & { items: CartItem[] },
  tipCents: number,
): Promise<CheckoutQuote> {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: cart.restaurantId } });
  if (!restaurant) {
    return { eligible: false, reason: "Restaurant not found", subtotalCents: 0, taxCents: 0, tipCents: 0, deliveryFeeCents: 0, serviceFeeCents: 0, discountCents: 0, totalCents: 0 };
  }
  if (restaurant.isSuspended) {
    return { eligible: false, reason: "This restaurant is temporarily unavailable", subtotalCents: 0, taxCents: 0, tipCents: 0, deliveryFeeCents: 0, serviceFeeCents: 0, discountCents: 0, totalCents: 0 };
  }

  const subtotalCents = cartSubtotalCents(cart.items);

  const [hours, capacity, deliveryConfig, deliveryZones, deliveryRules, activeDriverCount, activeOrderCount, taxRules, deliveryFeeRules, serviceFeeRules] =
    await Promise.all([
      prisma.restaurantHours.findMany({ where: { restaurantId: cart.restaurantId } }),
      getCapacity(cart.restaurantId),
      getConfig(cart.restaurantId),
      prisma.deliveryZone.findMany({ where: { restaurantId: cart.restaurantId } }),
      prisma.deliveryRule.findMany({ where: { restaurantId: cart.restaurantId } }),
      countActiveDriverAssignments(cart.restaurantId),
      prisma.order.count({ where: { restaurantId: cart.restaurantId, status: { in: [...ACTIVE_ORDER_STATUSES] } } }),
      prisma.tax.findMany({ where: { restaurantId: cart.restaurantId } }),
      prisma.deliveryFeeRule.findMany({ where: { restaurantId: cart.restaurantId } }),
      prisma.serviceFeeRule.findMany({ where: { restaurantId: cart.restaurantId } }),
    ]);

  let distanceMiles: number | undefined;
  let deliveryLat: number | undefined;
  let deliveryLng: number | undefined;
  if (cart.fulfillmentType === "DELIVERY") {
    // Scoped to the cart's own customerId (never just the bare id) — a
    // second, independent check alongside cart.service.ts's
    // assertDeliveryAddressOwnership, since this function is the one
    // that actually reads the address's lat/lng into the fee/eligibility
    // calculation. A guest cart (customerId null) can never resolve an
    // address here, matching the guest-checkout limitation elsewhere.
    const address =
      cart.deliveryAddressId && cart.customerId
        ? await prisma.customerAddress.findFirst({ where: { id: cart.deliveryAddressId, customerId: cart.customerId } })
        : null;
    if (!address?.lat || !address.lng || restaurant.lat === null || restaurant.lng === null) {
      return {
        eligible: false,
        reason: "A deliverable address with a valid location is required",
        subtotalCents,
        taxCents: 0,
        tipCents,
        deliveryFeeCents: 0,
        serviceFeeCents: 0,
        discountCents: 0,
        totalCents: 0,
      };
    }
    distanceMiles = distanceMilesBetween(restaurant.lat, restaurant.lng, address.lat, address.lng);
    deliveryLat = address.lat;
    deliveryLng = address.lng;
  }

  const routing = evaluateRouting({
    restaurantId: cart.restaurantId,
    isOpen: isRestaurantOpenAt(hours, cart.scheduledFor ?? new Date()),
    kitchenAvailable: isKitchenAvailable(capacity, activeOrderCount),
    activeDriverCount,
    deliveryConfig,
    deliveryZones,
    deliveryRules,
    distanceMiles,
    deliveryLat,
    deliveryLng,
    subtotalCents,
    fulfillmentType: cart.fulfillmentType,
    enabledPaymentMethodTypes: [],
  });

  if (!routing.eligible) {
    return {
      eligible: false,
      reason: routing.reason,
      subtotalCents,
      taxCents: 0,
      tipCents,
      deliveryFeeCents: 0,
      serviceFeeCents: 0,
      discountCents: 0,
      totalCents: 0,
    };
  }

  const deliveryFeeCents =
    cart.fulfillmentType === "DELIVERY" ? resolveDeliveryFeeCents(deliveryFeeRules, distanceMiles ?? 0, subtotalCents) : 0;
  const serviceFeeCents = resolveServiceFeeCents(serviceFeeRules, cart.fulfillmentType, subtotalCents);
  const taxCents = computeTaxCents(taxRules, subtotalCents, deliveryFeeCents);

  let discountCents = 0;
  let effectiveDeliveryFeeCents = deliveryFeeCents;
  if (cart.couponCode) {
    try {
      const validation = await validateCouponForRedemption(cart.restaurantId, cart.couponCode, subtotalCents, cart.customerId ?? undefined);
      if (validation.coupon.type === "FREE_DELIVERY") {
        effectiveDeliveryFeeCents = 0;
      } else {
        discountCents = validation.discountCents;
      }
    } catch {
      // An expired/invalid coupon at quote time simply stops applying —
      // it does not block checkout; placeOrder re-validates independently.
      discountCents = 0;
    }
  }

  // Same "stops applying rather than blocking checkout" treatment as the
  // coupon above — placeOrder re-validates the actual balance atomically
  // immediately before charging. Guests (no customerId) never have a
  // redeemable balance, so this is a no-op for them regardless of what
  // the cart field says.
  if (cart.customerId && cart.loyaltyPointsToRedeem) {
    const { program, pointsBalance } = await getAccountSummary(cart.customerId, cart.restaurantId);
    const points = Math.min(cart.loyaltyPointsToRedeem, pointsBalance);
    const remainingAfterCoupon = Math.max(0, subtotalCents - discountCents);
    discountCents += Math.min(computeRedemptionDiscountCents(program, points), remainingAfterCoupon);
  }

  const totalCents = Math.max(
    0,
    subtotalCents + taxCents + tipCents + effectiveDeliveryFeeCents + serviceFeeCents - discountCents,
  );

  return {
    eligible: true,
    resolvedFulfillmentMethod: routing.resolvedFulfillmentMethod,
    distanceMiles,
    subtotalCents,
    taxCents,
    tipCents,
    deliveryFeeCents: effectiveDeliveryFeeCents,
    serviceFeeCents,
    discountCents,
    totalCents,
  };
}
