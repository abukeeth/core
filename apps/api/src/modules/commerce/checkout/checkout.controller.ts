import type { Request, Response } from "express";
import { completeIdempotencyKey, failIdempotencyKey, reserveIdempotencyKey } from "../../../lib/idempotency";
import { assertCartOwnership, resolveCartIdentity } from "../cart/cart-identity";
import { CartNotFoundError } from "../cart/cart.errors";
import {
  CheckoutIneligibleError,
  EmptyCartError,
  GuestInfoRequiredError,
  ItemUnavailableAtCheckoutError,
  PaymentFailedError,
  PriceDriftError,
} from "./checkout.errors";
import { confirmCardPayment, placeOrder } from "./checkout.service";
import { placeOrderSchema, quoteRequestSchema } from "./checkout.validation";
import { computeCheckoutQuote } from "./quote.service";
import { getCartWithItems } from "../cart/cart.service";

export async function getQuoteHandler(req: Request, res: Response): Promise<void> {
  const parsed = quoteRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const cart = await getCartWithItems(req.params.cartId as string);
    assertCartOwnership(cart, resolveCartIdentity(req, res));
    const quote = await computeCheckoutQuote(cart, parsed.data.tipCents);
    res.status(200).json({ quote });
  } catch (err) {
    if (err instanceof CartNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function placeOrderHandler(req: Request, res: Response): Promise<void> {
  const parsed = placeOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  const idempotencyKey = req.idempotencyKey!;
  const cartId = req.params.cartId as string;

  const reservation = await reserveIdempotencyKey<{ order: unknown }>(idempotencyKey, "checkout.placeOrder");
  if (reservation.status === "completed") {
    res.status(201).json(reservation.response);
    return;
  }
  if (reservation.status === "in_progress") {
    res.status(409).json({ error: "This checkout request is already being processed" });
    return;
  }

  try {
    const cart = await getCartWithItems(cartId);
    assertCartOwnership(cart, resolveCartIdentity(req, res));
    const result = await placeOrder(cartId, cart.restaurantId, parsed.data);
    if (result.requiresAction) {
      // A 3DS/SCA challenge, not a completed order — 202, not 201. The
      // client must complete stripe.confirmCardPayment(clientSecret) and
      // then call the confirm-payment endpoint to finish checkout.
      const response = { order: result.order, requiresAction: result.requiresAction };
      await completeIdempotencyKey(idempotencyKey, response);
      res.status(202).json(response);
      return;
    }
    const response = { order: result.order };
    await completeIdempotencyKey(idempotencyKey, response);
    res.status(201).json(response);
  } catch (err) {
    await failIdempotencyKey(idempotencyKey);
    if (err instanceof CartNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof EmptyCartError || err instanceof GuestInfoRequiredError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (
      err instanceof CheckoutIneligibleError ||
      err instanceof ItemUnavailableAtCheckoutError ||
      err instanceof PriceDriftError
    ) {
      res.status(422).json({ error: err.message });
      return;
    }
    if (err instanceof PaymentFailedError) {
      res.status(402).json({ error: err.publicMessage });
      return;
    }
    throw err;
  }
}

/**
 * Resumes checkout after the customer completes a 3DS/SCA challenge
 * client-side for an order left in paymentStatus REQUIRES_ACTION (Sprint
 * 07.6 C-6). Not idempotency-key-guarded like place-order — capturing an
 * already-captured PaymentIntent is a graceful provider-side no-op/error,
 * not a double charge, since Stripe only ever captures a given intent once.
 */
export async function confirmPaymentHandler(req: Request, res: Response): Promise<void> {
  const cartId = req.params.cartId as string;

  try {
    const cart = await getCartWithItems(cartId);
    assertCartOwnership(cart, resolveCartIdentity(req, res));
    const result = await confirmCardPayment(cartId, cart.restaurantId);
    res.status(200).json({ order: result.order });
  } catch (err) {
    if (err instanceof CartNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof CheckoutIneligibleError) {
      res.status(422).json({ error: err.message });
      return;
    }
    if (err instanceof PaymentFailedError) {
      res.status(402).json({ error: err.publicMessage });
      return;
    }
    throw err;
  }
}
