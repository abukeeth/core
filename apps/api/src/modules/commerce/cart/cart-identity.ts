import type { Request, Response } from "express";
import { CUSTOMER_ACCESS_TOKEN_COOKIE } from "../customers/customer-cookies";
import { verifyCustomerAccessToken } from "../customers/customer-jwt";
import { CartNotFoundError } from "./cart.errors";
import type { CartIdentity } from "./cart.service";
import { resolveGuestSessionId } from "./guest-session";

/**
 * Soft customer-auth check — a cart is usable by guests, so a
 * missing/invalid customer token just falls back to guest identity.
 * Shared between cart.controller.ts and checkout.controller.ts, since
 * both need to resolve "who is making this request" before checking
 * cart ownership.
 */
export function resolveCartIdentity(req: Request, res: Response): CartIdentity {
  const token = req.cookies?.[CUSTOMER_ACCESS_TOKEN_COOKIE];
  if (token) {
    try {
      return { customerId: verifyCustomerAccessToken(token) };
    } catch {
      // fall through to guest identity
    }
  }
  return { guestSessionId: resolveGuestSessionId(req, res) };
}

/**
 * Identity-level ownership check — distinct from tenant isolation. A
 * cartId is returned in plaintext on every response and cached
 * client-side, so without this check anyone holding another identity's
 * cartId could read/mutate it, or place an order against it. Deliberately
 * throws the same CartNotFoundError a genuinely-missing cart would throw
 * (404, never 403) — mirrors this codebase's existing tenant-isolation
 * convention of never revealing a resource's existence to a caller who
 * doesn't own it, extended here to the identity axis.
 */
export function assertCartOwnership(
  cart: { customerId: string | null; guestSessionId: string | null },
  identity: CartIdentity,
): void {
  if (identity.customerId) {
    if (cart.customerId !== identity.customerId) {
      throw new CartNotFoundError();
    }
    return;
  }
  if (cart.guestSessionId !== identity.guestSessionId) {
    throw new CartNotFoundError();
  }
}
