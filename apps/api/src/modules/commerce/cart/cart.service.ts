import type { Cart, CartItem, FulfillmentType } from "@prisma/client";
import { getNumberEnv } from "../../../config/env";
import { prisma } from "../../../lib/prisma";
import { isItemOrderable } from "../menu-commerce/inventory.service";
import { listModifierGroupsForItem } from "../menu-commerce/modifiers.service";
import { resolveTableByToken } from "../qr-ordering/tables.service";
import {
  CartItemNotFoundError,
  CartNotFoundError,
  CartRestaurantMismatchError,
  DeliveryAddressNotFoundError,
  InvalidModifierSelectionError,
  ItemNotOrderableError,
} from "./cart.errors";
import type { AddCartItemInput, SetFulfillmentInput } from "./cart.validation";

const CART_TTL_MINUTES = getNumberEnv("CART_TTL_MINUTES", 120);

export interface CartIdentity {
  customerId?: string;
  guestSessionId?: string;
}

function cartExpiry(): Date {
  return new Date(Date.now() + CART_TTL_MINUTES * 60_000);
}

/**
 * Finds the caller's ACTIVE cart for this restaurant, or creates one.
 * Always returns `items` (matching getCartWithItems's shape below) —
 * the frontend's Cart type declares `items` as required and reads
 * `cart.items.length` immediately on the menu page (order/[restaurantId]/page.tsx),
 * so a response missing it (the bare Prisma `Cart` row has no `items` key
 * at all without an explicit include) crashed that page on load for both
 * a brand-new cart and a returning customer's existing one — discovered
 * while building the Sprint 08 beta demo, not a change in behavior for
 * any caller that already expected this shape.
 */
export async function getOrCreateActiveCart(
  restaurantId: string,
  identity: CartIdentity,
  fulfillmentType: FulfillmentType = "PICKUP",
): Promise<Cart & { items: CartItem[] }> {
  const existing = await prisma.cart.findFirst({
    where: {
      restaurantId,
      status: "ACTIVE",
      ...(identity.customerId ? { customerId: identity.customerId } : { guestSessionId: identity.guestSessionId }),
    },
    orderBy: { createdAt: "desc" },
    include: { items: true },
  });
  if (existing) return existing;

  return prisma.cart.create({
    data: {
      restaurantId,
      customerId: identity.customerId,
      guestSessionId: identity.customerId ? undefined : identity.guestSessionId,
      fulfillmentType,
      expiresAt: cartExpiry(),
    },
    include: { items: true },
  });
}

export async function getCartWithItems(cartId: string): Promise<Cart & { items: CartItem[] }> {
  const cart = await prisma.cart.findUnique({ where: { id: cartId }, include: { items: true } });
  if (!cart) {
    throw new CartNotFoundError();
  }
  return cart;
}

export function cartSubtotalCents(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
}

/**
 * Adds an item, computing and freezing unitPriceCents at add-time (base
 * price + variant delta + selected modifier deltas) — the price is
 * re-validated, never silently recalculated, at checkout confirmation
 * (spec §9). Validates the item is currently orderable and that modifier
 * selections satisfy each attached group's required/min/max constraints.
 */
export async function addCartItem(restaurantId: string, cartId: string, input: AddCartItemInput): Promise<CartItem> {
  const cart = await getCartWithItems(cartId);
  if (cart.restaurantId !== restaurantId) {
    throw new CartRestaurantMismatchError();
  }

  const menuItem = await prisma.menuItem.findUnique({ where: { id: input.menuItemId } });
  if (!menuItem || menuItem.restaurantId !== restaurantId) {
    throw new ItemNotOrderableError();
  }

  const inventory = await prisma.menuItemInventory.findUnique({ where: { menuItemId: menuItem.id } });
  if (!isItemOrderable(menuItem, inventory)) {
    throw new ItemNotOrderableError();
  }

  let priceDeltaCents = 0;
  let variantName: string | undefined;
  if (input.variantId) {
    const variant = await prisma.menuItemVariant.findUnique({ where: { id: input.variantId } });
    if (!variant || variant.menuItemId !== menuItem.id) {
      throw new ItemNotOrderableError();
    }
    priceDeltaCents += variant.priceDeltaCents;
    variantName = variant.name;
  }

  const attachedGroups = await listModifierGroupsForItem(restaurantId, menuItem.id);
  const selectedIds = new Set(input.modifierOptionIds);
  const modifiersSnapshot: { groupName: string; optionName: string; priceDeltaCents: number }[] = [];

  for (const group of attachedGroups) {
    const selectedInGroup = group.options.filter((o) => selectedIds.has(o.id));
    if (group.isRequired && selectedInGroup.length < Math.max(group.minSelections, 1)) {
      throw new InvalidModifierSelectionError(`"${group.name}" requires at least ${Math.max(group.minSelections, 1)} selection(s)`);
    }
    if (selectedInGroup.length < group.minSelections) {
      throw new InvalidModifierSelectionError(`"${group.name}" requires at least ${group.minSelections} selection(s)`);
    }
    if (group.maxSelections !== null && selectedInGroup.length > group.maxSelections) {
      throw new InvalidModifierSelectionError(`"${group.name}" allows at most ${group.maxSelections} selection(s)`);
    }
    for (const option of selectedInGroup) {
      if (!option.isAvailable) {
        throw new InvalidModifierSelectionError(`"${option.name}" is not currently available`);
      }
      priceDeltaCents += option.priceDeltaCents;
      modifiersSnapshot.push({ groupName: group.name, optionName: option.name, priceDeltaCents: option.priceDeltaCents });
    }
  }

  const unitPriceCents = menuItem.priceCents + priceDeltaCents;

  return prisma.cartItem.create({
    data: {
      cartId,
      menuItemId: menuItem.id,
      variantId: input.variantId,
      quantity: input.quantity,
      unitPriceCents,
      modifiersSnapshot: { variantName, modifiers: modifiersSnapshot } as never,
      notes: input.notes,
    },
  });
}

async function findOwnCartItem(cartId: string, itemId: string): Promise<CartItem> {
  const item = await prisma.cartItem.findUnique({ where: { id: itemId } });
  if (!item || item.cartId !== cartId) {
    throw new CartItemNotFoundError();
  }
  return item;
}

export async function updateCartItemQuantity(cartId: string, itemId: string, quantity: number): Promise<CartItem> {
  const item = await findOwnCartItem(cartId, itemId);
  return prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
}

export async function removeCartItem(cartId: string, itemId: string): Promise<void> {
  const item = await findOwnCartItem(cartId, itemId);
  await prisma.cartItem.delete({ where: { id: item.id } });
}

/**
 * A deliveryAddressId is only ever meaningful if it's one of the cart's
 * own customer's saved addresses — previously accepted whatever ID the
 * client sent with no ownership check at all, letting any authenticated
 * customer attach another customer's CustomerAddress row (and its
 * lat/lng) to their own cart. Guest carts (no customerId) can never have
 * a valid deliveryAddressId, since CustomerAddress.customerId is
 * required. Mirrors assertCartOwnership's convention of throwing the
 * same "not found" error a genuinely nonexistent address would throw,
 * rather than a distinct 403 that would confirm the ID belongs to
 * someone else.
 */
async function assertDeliveryAddressOwnership(customerId: string | null, deliveryAddressId: string | undefined): Promise<void> {
  if (!deliveryAddressId) return;
  const address =
    customerId && (await prisma.customerAddress.findFirst({ where: { id: deliveryAddressId, customerId } }));
  if (!address) {
    throw new DeliveryAddressNotFoundError();
  }
}

export async function setCartFulfillment(cartId: string, input: SetFulfillmentInput): Promise<Cart> {
  const cart = await getCartWithItems(cartId);
  await assertDeliveryAddressOwnership(cart.customerId, input.deliveryAddressId);
  return prisma.cart.update({
    where: { id: cartId },
    data: {
      fulfillmentType: input.fulfillmentType,
      scheduledFor: input.scheduledFor,
      deliveryAddressId: input.deliveryAddressId,
    },
  });
}

export async function setCartCoupon(cartId: string, code: string | null): Promise<Cart> {
  await getCartWithItems(cartId);
  return prisma.cart.update({ where: { id: cartId }, data: { couponCode: code } });
}

export async function setCartLoyaltyRedemption(cartId: string, points: number | null): Promise<Cart> {
  await getCartWithItems(cartId);
  return prisma.cart.update({ where: { id: cartId }, data: { loyaltyPointsToRedeem: points } });
}

/**
 * The sole path by which a Cart is ever associated with a Table — always
 * via a scanned QR token resolved server-side (resolveTableByToken), never
 * a client-supplied tableId. Rejects (CartRestaurantMismatchError) if the
 * token resolves to a table belonging to a different restaurant than the
 * cart's own, closing the cross-restaurant misattribution gap.
 */
export async function bindCartToTable(cartId: string, qrToken: string): Promise<Cart> {
  const cart = await getCartWithItems(cartId);
  const table = await resolveTableByToken(qrToken);
  if (table.restaurantId !== cart.restaurantId) {
    throw new CartRestaurantMismatchError();
  }
  return prisma.cart.update({
    where: { id: cartId },
    data: { tableId: table.id, fulfillmentType: "DINE_IN" },
  });
}
