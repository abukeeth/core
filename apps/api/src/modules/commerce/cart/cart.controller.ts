import type { Request, Response } from "express";
import { CouponInvalidError, CouponNotFoundError } from "../coupons/coupons.errors";
import { validateCouponForRedemption } from "../coupons/coupons.service";
import { getAccountSummary } from "../loyalty/loyalty.service";
import { InvalidQrTokenError } from "../qr-ordering/qr-ordering.errors";
import { assertCartOwnership, resolveCartIdentity } from "./cart-identity";
import {
  CartItemNotFoundError,
  CartNotFoundError,
  CartRestaurantMismatchError,
  DeliveryAddressNotFoundError,
  InvalidModifierSelectionError,
  ItemNotOrderableError,
} from "./cart.errors";
import {
  addCartItem,
  bindCartToTable,
  cartSubtotalCents,
  getCartWithItems,
  getOrCreateActiveCart,
  removeCartItem,
  setCartCoupon,
  setCartFulfillment,
  setCartLoyaltyRedemption,
  updateCartItemQuantity,
} from "./cart.service";
import {
  addCartItemSchema,
  applyCouponSchema,
  applyLoyaltyRedemptionSchema,
  bindTableSchema,
  createCartSchema,
  setFulfillmentSchema,
  updateCartItemSchema,
} from "./cart.validation";

export async function createCartHandler(req: Request, res: Response): Promise<void> {
  const parsed = createCartSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  const restaurantId = req.params.restaurantId as string;
  const identity = resolveCartIdentity(req, res);
  const cart = await getOrCreateActiveCart(restaurantId, identity, parsed.data.fulfillmentType);
  res.status(201).json({ cart });
}

/**
 * The only endpoint that may set Cart.tableId — always via a scanned QR
 * token resolved server-side, never a client-supplied tableId (C-13).
 */
export async function bindTableHandler(req: Request, res: Response): Promise<void> {
  const parsed = bindTableSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const cart = await getCartWithItems(req.params.cartId as string);
    assertCartOwnership(cart, resolveCartIdentity(req, res));
    const updated = await bindCartToTable(cart.id, parsed.data.qrToken);
    res.status(200).json({ cart: updated });
  } catch (err) {
    if (err instanceof CartNotFoundError || err instanceof InvalidQrTokenError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof CartRestaurantMismatchError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function getCartHandler(req: Request, res: Response): Promise<void> {
  try {
    const cart = await getCartWithItems(req.params.cartId as string);
    assertCartOwnership(cart, resolveCartIdentity(req, res));
    res.status(200).json({ cart, subtotalCents: cartSubtotalCents(cart.items) });
  } catch (err) {
    if (err instanceof CartNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function addCartItemHandler(req: Request, res: Response): Promise<void> {
  const parsed = addCartItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const cart = await getCartWithItems(req.params.cartId as string);
    assertCartOwnership(cart, resolveCartIdentity(req, res));
    const item = await addCartItem(cart.restaurantId, cart.id, parsed.data);
    res.status(201).json({ item });
  } catch (err) {
    if (err instanceof CartNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof ItemNotOrderableError || err instanceof CartRestaurantMismatchError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof InvalidModifierSelectionError) {
      res.status(422).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function updateCartItemHandler(req: Request, res: Response): Promise<void> {
  const parsed = updateCartItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const cart = await getCartWithItems(req.params.cartId as string);
    assertCartOwnership(cart, resolveCartIdentity(req, res));
    const item = await updateCartItemQuantity(req.params.cartId as string, req.params.itemId as string, parsed.data.quantity);
    res.status(200).json({ item });
  } catch (err) {
    if (err instanceof CartNotFoundError || err instanceof CartItemNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function removeCartItemHandler(req: Request, res: Response): Promise<void> {
  try {
    const cart = await getCartWithItems(req.params.cartId as string);
    assertCartOwnership(cart, resolveCartIdentity(req, res));
    await removeCartItem(req.params.cartId as string, req.params.itemId as string);
    res.status(204).send();
  } catch (err) {
    if (err instanceof CartNotFoundError || err instanceof CartItemNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function setFulfillmentHandler(req: Request, res: Response): Promise<void> {
  const parsed = setFulfillmentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const existing = await getCartWithItems(req.params.cartId as string);
    assertCartOwnership(existing, resolveCartIdentity(req, res));
    const cart = await setCartFulfillment(req.params.cartId as string, parsed.data);
    res.status(200).json({ cart });
  } catch (err) {
    if (err instanceof CartNotFoundError || err instanceof DeliveryAddressNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function applyCouponHandler(req: Request, res: Response): Promise<void> {
  const parsed = applyCouponSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const cart = await getCartWithItems(req.params.cartId as string);
    const identity = resolveCartIdentity(req, res);
    assertCartOwnership(cart, identity);
    const { discountCents } = await validateCouponForRedemption(
      cart.restaurantId,
      parsed.data.code,
      cartSubtotalCents(cart.items),
      identity.customerId,
    );
    const updated = await setCartCoupon(cart.id, parsed.data.code.toUpperCase());
    res.status(200).json({ cart: updated, discountCents });
  } catch (err) {
    if (err instanceof CartNotFoundError || err instanceof CouponNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof CouponInvalidError) {
      res.status(422).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function removeCouponHandler(req: Request, res: Response): Promise<void> {
  try {
    const existing = await getCartWithItems(req.params.cartId as string);
    assertCartOwnership(existing, resolveCartIdentity(req, res));
    const cart = await setCartCoupon(req.params.cartId as string, null);
    res.status(200).json({ cart });
  } catch (err) {
    if (err instanceof CartNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

/**
 * Guests can't redeem (no LoyaltyAccount identity to debit) — this is a
 * 422, not a 404/401, since the cart itself is perfectly valid for guest
 * checkout, just not for this one action. The actual balance debit is
 * re-validated atomically inside placeOrder's transaction
 * (loyalty.service.ts redeemPointsInTransaction); this handler's balance
 * check is a non-authoritative UX check only, mirroring applyCouponHandler.
 */
export async function applyLoyaltyRedemptionHandler(req: Request, res: Response): Promise<void> {
  const parsed = applyLoyaltyRedemptionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const cart = await getCartWithItems(req.params.cartId as string);
    const identity = resolveCartIdentity(req, res);
    assertCartOwnership(cart, identity);
    if (!identity.customerId) {
      res.status(422).json({ error: "Log in to redeem loyalty points" });
      return;
    }
    const { program, pointsBalance } = await getAccountSummary(identity.customerId, cart.restaurantId);
    if (!program || !program.isActive) {
      res.status(422).json({ error: "This restaurant's loyalty program isn't active" });
      return;
    }
    if (parsed.data.points > pointsBalance) {
      res.status(422).json({ error: "Not enough loyalty points for this redemption" });
      return;
    }
    const updated = await setCartLoyaltyRedemption(cart.id, parsed.data.points);
    res.status(200).json({ cart: updated, discountCents: parsed.data.points * program.redemptionRateCentsPerPoint });
  } catch (err) {
    if (err instanceof CartNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function removeLoyaltyRedemptionHandler(req: Request, res: Response): Promise<void> {
  try {
    const existing = await getCartWithItems(req.params.cartId as string);
    assertCartOwnership(existing, resolveCartIdentity(req, res));
    const cart = await setCartLoyaltyRedemption(req.params.cartId as string, null);
    res.status(200).json({ cart });
  } catch (err) {
    if (err instanceof CartNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}
