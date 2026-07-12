import { Prisma } from "@prisma/client";
import type { Coupon } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { CouponCodeInUseError, CouponInvalidError, CouponNotFoundError } from "./coupons.errors";
import type { CreateCouponInput, UpdateCouponInput } from "./coupons.validation";

const BASIS_POINTS_DIVISOR = 10_000;

export async function listCoupons(restaurantId: string): Promise<Coupon[]> {
  return prisma.coupon.findMany({ where: { restaurantId } });
}

/**
 * Sprint 20A Task 5 — the storefront's "Offers" section needs only coupons
 * a customer could actually redeem right now, not the owner's full
 * (including expired/scheduled/disabled) list `listCoupons` returns. Same
 * active-window semantics `validateCouponForRedemption` already enforces
 * at checkout, factored out here so a coupon shown as "active" on the
 * storefront and a coupon checkout actually accepts can never drift apart.
 */
export async function listActiveCoupons(restaurantId: string): Promise<Coupon[]> {
  const now = new Date();
  return prisma.coupon.findMany({
    where: {
      restaurantId,
      isActive: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] }],
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createCoupon(restaurantId: string, input: CreateCouponInput): Promise<Coupon> {
  try {
    return await prisma.coupon.create({ data: { restaurantId, ...input } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new CouponCodeInUseError();
    }
    throw err;
  }
}

async function findOwnCoupon(restaurantId: string, id: string): Promise<Coupon> {
  const coupon = await prisma.coupon.findUnique({ where: { id } });
  if (!coupon || coupon.restaurantId !== restaurantId) {
    throw new CouponNotFoundError();
  }
  return coupon;
}

export async function updateCoupon(restaurantId: string, id: string, input: UpdateCouponInput): Promise<Coupon> {
  const coupon = await findOwnCoupon(restaurantId, id);
  return prisma.coupon.update({ where: { id: coupon.id }, data: input });
}

export async function deleteCoupon(restaurantId: string, id: string): Promise<void> {
  const coupon = await findOwnCoupon(restaurantId, id);
  await prisma.coupon.delete({ where: { id: coupon.id } });
}

export interface CouponRedemptionValidation {
  coupon: Coupon;
  discountCents: number;
}

/**
 * The core validation function checkout calls directly. Does NOT create a
 * CouponRedemption row — that's checkout's job once an order is actually
 * placed, since redemption should only be recorded on a successful order.
 * FREE_DELIVERY returns discountCents: 0 — checkout applies it by zeroing
 * the delivery fee separately, not via this discount amount.
 */
export async function validateCouponForRedemption(
  restaurantId: string,
  code: string,
  subtotalCents: number,
  customerId?: string,
  guestCustomerId?: string,
): Promise<CouponRedemptionValidation> {
  const coupon = await prisma.coupon.findUnique({
    where: { restaurantId_code: { restaurantId, code: code.toUpperCase() } },
  });
  if (!coupon) {
    throw new CouponNotFoundError();
  }

  if (!coupon.isActive) {
    throw new CouponInvalidError("This coupon is no longer active");
  }
  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) {
    throw new CouponInvalidError("This coupon is not active yet");
  }
  if (coupon.expiresAt && coupon.expiresAt < now) {
    throw new CouponInvalidError("This coupon has expired");
  }
  if (coupon.minOrderCents !== null && subtotalCents < coupon.minOrderCents) {
    throw new CouponInvalidError(`This coupon requires a minimum order of $${(coupon.minOrderCents / 100).toFixed(2)}`);
  }
  if (coupon.maxRedemptions !== null) {
    const totalRedemptions = await prisma.couponRedemption.count({ where: { couponId: coupon.id } });
    if (totalRedemptions >= coupon.maxRedemptions) {
      throw new CouponInvalidError("This coupon has reached its redemption limit");
    }
  }
  // Per-customer limit, enforced for logged-in customers by customerId and
  // for guests by their resolved GuestCustomer id (Sprint 07.7 H-5). Note
  // this is an EMAIL-keyed limit for guests, not an identity-verified one
  // — checkout.service.ts resolves (reuses, rather than always creating) a
  // GuestCustomer row by email, so repeat guest checkouts under the same
  // email correctly share one id and hit this same limit. A guest willing
  // to use a different email address each time is not blocked by this
  // check; closing that fully would require an account/verification
  // requirement for per-customer-limited coupons, a larger product
  // decision out of scope here.
  const redemptionIdentityWhere = customerId ? { customerId } : guestCustomerId ? { guestCustomerId } : null;
  if (redemptionIdentityWhere && coupon.maxRedemptionsPerCustomer !== null) {
    const priorRedemptions = await prisma.couponRedemption.count({
      where: { couponId: coupon.id, ...redemptionIdentityWhere },
    });
    if (priorRedemptions >= coupon.maxRedemptionsPerCustomer) {
      throw new CouponInvalidError("You've already used this coupon the maximum number of times");
    }
  }

  let discountCents = 0;
  if (coupon.type === "PERCENTAGE") {
    discountCents = Math.round((subtotalCents * coupon.value) / BASIS_POINTS_DIVISOR);
    if (coupon.maxDiscountCents !== null) {
      discountCents = Math.min(discountCents, coupon.maxDiscountCents);
    }
  } else if (coupon.type === "FIXED_AMOUNT") {
    discountCents = Math.min(coupon.value, subtotalCents);
  }
  // FREE_DELIVERY: discountCents stays 0 by design.

  return { coupon, discountCents };
}
