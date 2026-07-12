import { Prisma } from "@prisma/client";
import type { Order } from "@prisma/client";
import { bestEffort } from "../../../lib/best-effort";
import { prisma } from "../../../lib/prisma";
import { getCartWithItems } from "../cart/cart.service";
import { isItemOrderable } from "../menu-commerce/inventory.service";
import { authorizeOrderPayment, captureOrderPayment } from "../payments/orchestrator";
import { NoAvailableProviderError, PaymentMethodNotFoundError } from "../payments/payments.errors";
import { validateCouponForRedemption } from "../coupons/coupons.service";
import { CouponInvalidError, CouponNotFoundError } from "../coupons/coupons.errors";
import { InsufficientLoyaltyPointsError } from "../loyalty/loyalty.errors";
import { redeemPointsInTransaction } from "../loyalty/loyalty.service";
import { emitOrderEvent, writeOrderEvent } from "../events/record-order-event";
import { assertValidOrderTransition } from "../orders/order-state-machine";
import { nextOrderNumber } from "../orders/order-number";
import { sendNewOrderStaffAlert, sendOrderConfirmation, sendPaymentFailedNotification } from "../notifications/notifications.service";
import {
  CheckoutIneligibleError,
  EmptyCartError,
  GuestInfoRequiredError,
  ItemUnavailableAtCheckoutError,
  PaymentFailedError,
  PriceDriftError,
} from "./checkout.errors";
import type { PlaceOrderInput } from "./checkout.validation";
import { computeCheckoutQuote } from "./quote.service";

const CASH_METHOD_TYPES = new Set(["CASH_ON_DELIVERY", "CASH_AT_PICKUP"]);

export interface PlaceOrderResult {
  order: Order;
  /** Set when the provider requires a customer-facing 3DS/SCA challenge
   * before this payment can be captured. The order is left in
   * paymentStatus REQUIRES_ACTION; the caller must complete the challenge
   * client-side (stripe.confirmCardPayment) and then call
   * confirmCardPayment to resume (Sprint 07.6 C-6). */
  requiresAction?: { clientSecret: string };
}

function isCartConflict(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    Array.isArray(err.meta?.target) &&
    (err.meta.target as string[]).includes("cartId")
  );
}

/** Prisma's code for a transaction aborted by the database due to a
 * serializable write conflict — the expected, correct outcome when two
 * concurrent placeOrder calls race past the same coupon's redemption cap. */
function isSerializationFailure(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
}

/**
 * The order-placement orchestration engine (Sprint 07 spec §3 step 13,
 * §4). This is the sequential, money-handling core the Sprint 07 approval
 * required be built directly rather than delegated: it (a) re-validates
 * everything fresh against current data — never trusts a client-supplied
 * price, (b) creates the durable Order/OrderItem/Fulfillment rows in one
 * atomic transaction, (c) only THEN calls out to the payment provider
 * (which must reference an existing orderId), and (d) reacts to the
 * payment outcome with the correct state-machine transition.
 */
export async function placeOrder(cartId: string, restaurantId: string, input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const cart = await getCartWithItems(cartId);
  if (cart.restaurantId !== restaurantId) {
    throw new CheckoutIneligibleError("This cart does not belong to this restaurant");
  }
  if (cart.status !== "ACTIVE") {
    // Already converted by a prior successful placeOrder call, or lost a
    // race to a concurrent one — reject before ever re-authorizing a
    // payment against the same cart a second time.
    throw new CheckoutIneligibleError("This cart has already been checked out");
  }
  if (cart.items.length === 0) {
    throw new EmptyCartError();
  }
  if (!cart.customerId && !input.guestEmail) {
    throw new GuestInfoRequiredError();
  }

  // Re-validate every item is still orderable and its base price hasn't
  // drifted since it was added to the cart — the one class of price
  // drift this checks (base MenuItem/variant price); modifier-option-
  // level drift detection is a documented known limitation.
  for (const item of cart.items) {
    const menuItem = await prisma.menuItem.findUnique({ where: { id: item.menuItemId } });
    if (!menuItem) {
      throw new ItemUnavailableAtCheckoutError("An item in your cart");
    }
    const inventory = await prisma.menuItemInventory.findUnique({ where: { menuItemId: menuItem.id } });
    if (!isItemOrderable(menuItem, inventory)) {
      throw new ItemUnavailableAtCheckoutError(menuItem.name);
    }
    let expectedPriceCents = menuItem.priceCents;
    if (item.variantId) {
      const variant = await prisma.menuItemVariant.findUnique({ where: { id: item.variantId } });
      expectedPriceCents += variant?.priceDeltaCents ?? 0;
    }
    const modifiersTotal = (item.modifiersSnapshot as { modifiers?: { priceDeltaCents: number }[] } | null)?.modifiers?.reduce(
      (sum, m) => sum + m.priceDeltaCents,
      0,
    ) ?? 0;
    if (expectedPriceCents + modifiersTotal !== item.unitPriceCents) {
      throw new PriceDriftError();
    }
  }

  const quote = await computeCheckoutQuote(cart, input.tipCents);
  if (!quote.eligible) {
    throw new CheckoutIneligibleError(quote.reason ?? "This order cannot be placed right now");
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  const staffAlertEmail = restaurant ? await resolveStaffAlertEmail(restaurantId) : undefined;

  // Resolved once here (non-transactional, best-effort UX lookup) so the
  // pre-transaction coupon validation can enforce the same per-guest limit
  // a repeat guest checkout under this email will hit inside the
  // transaction below (Sprint 07.7 H-5).
  const existingGuestCustomer =
    !cart.customerId && input.guestEmail ? await prisma.guestCustomer.findFirst({ where: { email: input.guestEmail } }) : null;

  // Coupon re-validated independently here (not trusting the quote's
  // best-effort pass) since redemption is only ever recorded on a
  // successful order.
  let couponId: string | undefined;
  let couponMaxRedemptions: number | null = null;
  let couponMaxRedemptionsPerCustomer: number | null = null;
  if (cart.couponCode) {
    try {
      const validation = await validateCouponForRedemption(
        restaurantId,
        cart.couponCode,
        quote.subtotalCents,
        cart.customerId ?? undefined,
        existingGuestCustomer?.id,
      );
      couponId = validation.coupon.id;
      couponMaxRedemptions = validation.coupon.maxRedemptions;
      couponMaxRedemptionsPerCustomer = validation.coupon.maxRedemptionsPerCustomer;
    } catch (err) {
      if (err instanceof CouponInvalidError || err instanceof CouponNotFoundError) {
        throw new CheckoutIneligibleError(err.message);
      }
      throw err;
    }
  }

  // Step A — create the durable Order + OrderItem + Fulfillment rows
  // atomically, PENDING_PAYMENT/UNPAID/UNASSIGNED. Payment authorization
  // happens AFTER this commits, since PaymentAttempt.orderId is a real FK.
  let order: Order;
  try {
    const result = await prisma.$transaction(async (tx) => {
      let resolvedGuestCustomerId: string | undefined;
      if (!cart.customerId && input.guestEmail && input.guestName) {
        // Find-or-create by email so repeat guest checkouts under the same
        // email reuse one GuestCustomer row — required for the
        // per-customer coupon redemption cap below to actually apply
        // across a guest's separate orders (Sprint 07.7 H-5).
        const existingGuest = await tx.guestCustomer.findFirst({ where: { email: input.guestEmail } });
        if (existingGuest) {
          resolvedGuestCustomerId = existingGuest.id;
        } else {
          const guest = await tx.guestCustomer.create({
            data: { email: input.guestEmail, name: input.guestName, phone: input.guestPhone },
          });
          resolvedGuestCustomerId = guest.id;
        }
      }

      const orderNumber = await nextOrderNumber(tx, restaurantId);
      const created = await tx.order.create({
        data: {
          orderNumber,
          restaurantId,
          customerId: cart.customerId,
          guestCustomerId: resolvedGuestCustomerId,
          cartId: cart.id,
          fulfillmentType: cart.fulfillmentType,
          source: "WEBSITE",
          tableId: cart.tableId,
          status: "PENDING_PAYMENT",
          paymentStatus: "UNPAID",
          fulfillmentStatus: "UNASSIGNED",
          subtotalCents: quote.subtotalCents,
          taxCents: quote.taxCents,
          tipCents: quote.tipCents,
          deliveryFeeCents: quote.deliveryFeeCents,
          serviceFeeCents: quote.serviceFeeCents,
          discountCents: quote.discountCents,
          totalCents: quote.totalCents,
          scheduledFor: cart.scheduledFor,
          deliveryAddressId: cart.deliveryAddressId,
          deliveryInstructions: input.deliveryInstructions,
          notes: input.notes,
        },
      });

      await tx.orderItem.createMany({
        data: cart.items.map((item) => ({
          orderId: created.id,
          menuItemId: item.menuItemId,
          nameSnapshot: "", // backfilled below (needs menuItem.name, fetched outside tx to keep this loop tx-light)
          variantNameSnapshot: null,
          unitPriceCents: item.unitPriceCents,
          quantity: item.quantity,
          modifiersSnapshot: item.modifiersSnapshot as Prisma.InputJsonValue,
          lineTotalCents: item.unitPriceCents * item.quantity,
        })),
      });

      await tx.fulfillment.create({
        data: { orderId: created.id, restaurantId, method: quote.resolvedFulfillmentMethod ?? "PICKUP", status: "UNASSIGNED" },
      });

      if (couponId) {
        // Re-check the redemption caps inside this transaction, immediately
        // before the insert — the earlier validateCouponForRedemption call
        // is a non-authoritative UX check only. Serializable isolation
        // (set below) turns the count-then-insert pair into a real atomic
        // guarantee: two concurrent orders racing past a "count < max"
        // check can no longer both insert, since one transaction will be
        // forced to abort with a serialization failure.
        if (couponMaxRedemptions !== null) {
          const totalRedemptions = await tx.couponRedemption.count({ where: { couponId } });
          if (totalRedemptions >= couponMaxRedemptions) {
            throw new CouponInvalidError("This coupon has reached its redemption limit");
          }
        }
        // Per-customer recount, authoritative and inside the same
        // serializable transaction — covers both a logged-in customer and
        // a guest keyed by their resolved (found-or-created) GuestCustomer
        // id (Sprint 07.7 H-5).
        const redemptionIdentityWhere = cart.customerId
          ? { customerId: cart.customerId }
          : resolvedGuestCustomerId
            ? { guestCustomerId: resolvedGuestCustomerId }
            : null;
        if (redemptionIdentityWhere && couponMaxRedemptionsPerCustomer !== null) {
          const customerRedemptions = await tx.couponRedemption.count({
            where: { couponId, ...redemptionIdentityWhere },
          });
          if (customerRedemptions >= couponMaxRedemptionsPerCustomer) {
            throw new CouponInvalidError("You've already used this coupon the maximum number of times");
          }
        }
        await tx.couponRedemption.create({
          data: {
            couponId,
            orderId: created.id,
            customerId: cart.customerId,
            guestCustomerId: resolvedGuestCustomerId,
            discountAppliedCents: quote.discountCents,
          },
        });
      }

      // Loyalty redemption: an independent atomic step from the coupon
      // block above (not layered onto it) — the WHERE-guarded UPDATE
      // inside redeemPointsInTransaction is atomic at the database's row
      // level under any isolation level, so it doesn't need (and doesn't
      // force) the Serializable isolation the coupon path requires for
      // its count-then-insert check. cart.customerId is required (never
      // set for guests, who have no LoyaltyAccount identity).
      if (cart.customerId && cart.loyaltyPointsToRedeem) {
        const redeemed = await redeemPointsInTransaction(tx, cart.customerId, restaurantId, cart.loyaltyPointsToRedeem, created.id);
        if (!redeemed) {
          throw new InsufficientLoyaltyPointsError();
        }
      }

      // The cart's ACTIVE -> CONVERTED transition happens in the same
      // transaction as Order creation, guarded above by the cart-status
      // check and by Order.cartId's unique constraint: a concurrent second
      // placeOrder call for the same cart either lost the status check or
      // will lose the race here via P2002, never both creating an Order.
      await tx.cart.update({ where: { id: cart.id }, data: { status: "CONVERTED" } });

      await writeOrderEvent({ orderId: created.id, restaurantId, type: "ORDER_CREATED" }, tx);

      return { order: created, guestCustomerId: resolvedGuestCustomerId };
    }, couponId ? { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } : undefined);
    order = result.order;
  } catch (err) {
    if (isCartConflict(err)) {
      throw new CheckoutIneligibleError("This cart has already been checked out");
    }
    if (err instanceof CouponInvalidError) {
      throw new CheckoutIneligibleError(err.message);
    }
    if (err instanceof InsufficientLoyaltyPointsError) {
      throw new CheckoutIneligibleError("Your loyalty points balance changed — please review your redemption and try again");
    }
    if (isSerializationFailure(err)) {
      throw new CheckoutIneligibleError("This coupon just reached its redemption limit — please remove it and try again");
    }
    throw err;
  }

  // Backfill nameSnapshot now that OrderItems exist (kept out of the
  // transaction above to avoid an extra round trip per item inside it).
  await backfillOrderItemNames(order.id, cart.items.map((i) => i.menuItemId));

  emitOrderEvent({ orderId: order.id, restaurantId, type: "ORDER_CREATED" });

  const customerEmail = input.guestEmail ?? (cart.customerId ? (await prisma.customer.findUnique({ where: { id: cart.customerId } }))?.email : undefined);

  // Step C — payment. Everything up to and including a successful
  // captureOrderPayment call is allowed to throw normally — no money has
  // moved (cash) or the provider has definitively not captured funds
  // (card). The instant capture succeeds, we cross the "point of no
  // return": every remaining step is wrapped in bestEffort so it can never
  // cause placeOrder to throw and trigger a retry against an already-paid
  // order.
  if (CASH_METHOD_TYPES.has(input.methodType)) {
    await confirmOrder(order.id, restaurantId);
  } else {
    if (!input.methodToken) {
      await failOrder(order.id, restaurantId);
      throw new PaymentFailedError("A payment method is required for this method type", "method_token_required");
    }
    try {
      const authResult = await authorizeOrderPayment({
        orderId: order.id,
        restaurantId,
        methodType: input.methodType,
        methodToken: input.methodToken,
        amountCents: quote.totalCents,
        currency: "usd",
      });

      if (authResult.requiresAction) {
        // A 3DS/SCA challenge, not a decline or a capture — the order
        // stays PENDING_PAYMENT/REQUIRES_ACTION until the customer
        // completes the challenge and confirmCardPayment resumes this
        // exact flow from the capture step. No notifications yet; no
        // money has moved.
        await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "REQUIRES_ACTION" } });
        const pendingOrder = await prisma.order.findUnique({ where: { id: order.id } });
        return { order: pendingOrder ?? order, requiresAction: authResult.requiresAction };
      }

      await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "AUTHORIZED" } });
      await captureOrderPayment(authResult.payment.id, restaurantId);
    } catch (err) {
      await failOrder(order.id, restaurantId);
      if (customerEmail) {
        await sendPaymentFailedNotification(order.id, restaurantId, customerEmail, order.orderNumber);
      }
      if (err instanceof NoAvailableProviderError) {
        // May carry the raw provider decline text in err.message — kept
        // in PaymentFailedError's internal `detail` for server-side logs
        // only; the public-facing category below is always the fixed,
        // safe string (Sprint 07.7 H-3).
        throw new PaymentFailedError(err.message, "declined_or_unavailable");
      }
      if (err instanceof PaymentMethodNotFoundError) {
        throw new PaymentFailedError(err.message, "invalid_method");
      }
      throw err;
    }

    await completeCardPayment(order, restaurantId);
  }

  await sendOrderNotifications(order, restaurantId, customerEmail, staffAlertEmail);

  const finalOrder = await prisma.order.findUnique({ where: { id: order.id } });
  return { order: finalOrder ?? order };
}

/**
 * Resumes a card payment left in paymentStatus REQUIRES_ACTION after the
 * customer completes a 3DS/SCA challenge client-side — effectively
 * "placeOrder from the capture step" for an order whose authorization
 * already exists (Sprint 07.6 C-6). Shares completeCardPayment with
 * placeOrder's own inline card-success path so the two callers can never
 * diverge on what "payment succeeded" actually does.
 */
export async function confirmCardPayment(cartId: string, restaurantId: string): Promise<PlaceOrderResult> {
  const order = await prisma.order.findUnique({ where: { cartId } });
  if (!order || order.restaurantId !== restaurantId) {
    throw new CheckoutIneligibleError("This cart does not belong to this restaurant");
  }
  if (order.paymentStatus !== "REQUIRES_ACTION") {
    throw new CheckoutIneligibleError("This order is not awaiting payment confirmation");
  }

  const payment = await prisma.payment.findUnique({ where: { orderId: order.id } });
  if (!payment) {
    throw new PaymentFailedError("No payment found for this order", "generic");
  }

  const customerEmail = await resolveOrderCustomerEmail(order);
  const staffAlertEmail = await resolveStaffAlertEmail(restaurantId);

  try {
    await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "AUTHORIZED" } });
    await captureOrderPayment(payment.id, restaurantId);
  } catch (err) {
    await failOrder(order.id, restaurantId);
    if (customerEmail) {
      await sendPaymentFailedNotification(order.id, restaurantId, customerEmail, order.orderNumber);
    }
    throw err instanceof Error ? new PaymentFailedError(err.message, "declined_or_unavailable") : err;
  }

  await completeCardPayment(order, restaurantId);
  await sendOrderNotifications(order, restaurantId, customerEmail, staffAlertEmail);

  const finalOrder = await prisma.order.findUnique({ where: { id: order.id } });
  return { order: finalOrder ?? order };
}

/**
 * The point-of-no-return tail for a card payment whose capture has just
 * succeeded — shared between placeOrder's inline flow and
 * confirmCardPayment's post-3DS resume flow. Never throws (bestEffort):
 * once capture has succeeded, nothing here may cause the caller to throw
 * and trigger an idempotency-key retry against an already-paid order.
 */
async function completeCardPayment(order: Order, restaurantId: string): Promise<void> {
  await bestEffort(() => prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "PAID" } }));
  await bestEffort(() => writeOrderEvent({ orderId: order.id, restaurantId, type: "PAYMENT_CAPTURED" }));
  emitOrderEvent({ orderId: order.id, restaurantId, type: "PAYMENT_CAPTURED" });
  await bestEffort(() => confirmOrder(order.id, restaurantId));
  await bestEffort(() => createSubLedgerTransactions(order.id, restaurantId, order.tipCents, order.serviceFeeCents));
}

async function sendOrderNotifications(
  order: Order,
  restaurantId: string,
  customerEmail: string | undefined,
  staffAlertEmail: string | undefined,
): Promise<void> {
  if (customerEmail) {
    await bestEffort(() => sendOrderConfirmation(order.id, restaurantId, customerEmail, order.orderNumber, order.totalCents));
  }
  if (staffAlertEmail) {
    await bestEffort(() => sendNewOrderStaffAlert(order.id, restaurantId, staffAlertEmail, order.orderNumber));
  }
}

async function resolveOrderCustomerEmail(order: Order): Promise<string | undefined> {
  if (order.guestCustomerId) {
    const guest = await prisma.guestCustomer.findUnique({ where: { id: order.guestCustomerId } });
    return guest?.email;
  }
  if (order.customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: order.customerId } });
    return customer?.email;
  }
  return undefined;
}

async function backfillOrderItemNames(orderId: string, menuItemIds: string[]): Promise<void> {
  const menuItems = await prisma.menuItem.findMany({ where: { id: { in: menuItemIds } } });
  const byId = new Map(menuItems.map((m) => [m.id, m.name]));
  const orderItems = await prisma.orderItem.findMany({ where: { orderId } });
  await Promise.all(
    orderItems.map((oi) =>
      prisma.orderItem.update({ where: { id: oi.id }, data: { nameSnapshot: byId.get(oi.menuItemId) ?? "Item" } }),
    ),
  );
}

async function confirmOrder(orderId: string, restaurantId: string): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  assertValidOrderTransition(order.status, "CONFIRMED");
  await prisma.order.update({ where: { id: orderId }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
  await writeOrderEvent({ orderId, restaurantId, type: "ORDER_CONFIRMED" });
  await prisma.orderTimeline.create({ data: { orderId, milestone: "CONFIRMED" } });
  emitOrderEvent({ orderId, restaurantId, type: "ORDER_CONFIRMED" });
}

async function failOrder(orderId: string, restaurantId: string): Promise<void> {
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
  if (order.status !== "PENDING_PAYMENT") return;
  assertValidOrderTransition(order.status, "FAILED");
  await prisma.order.update({ where: { id: orderId }, data: { status: "FAILED", paymentStatus: "FAILED" } });
  await writeOrderEvent({ orderId, restaurantId, type: "PAYMENT_FAILED" });
  emitOrderEvent({ orderId, restaurantId, type: "PAYMENT_FAILED" });
}

async function createSubLedgerTransactions(orderId: string, restaurantId: string, tipCents: number, serviceFeeCents: number): Promise<void> {
  const rows: { orderId: string; restaurantId: string; type: "TIP" | "SERVICE_FEE"; amountCents: number }[] = [];
  if (tipCents > 0) rows.push({ orderId, restaurantId, type: "TIP", amountCents: tipCents });
  if (serviceFeeCents > 0) rows.push({ orderId, restaurantId, type: "SERVICE_FEE", amountCents: serviceFeeCents });
  if (rows.length > 0) {
    await prisma.transaction.createMany({ data: rows });
  }
}

async function resolveStaffAlertEmail(restaurantId: string): Promise<string | undefined> {
  const owner = await prisma.user.findFirst({ where: { ownedRestaurant: { id: restaurantId } } });
  return owner?.email;
}
