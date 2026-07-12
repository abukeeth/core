import type { Request, Response } from "express";
import { NoRestaurantError } from "../../restaurants/restaurant.errors";
import { getOwnRestaurantId } from "../../restaurants/restaurant.service";
import { CouponCodeInUseError, CouponNotFoundError } from "./coupons.errors";
import { createCouponSchema, updateCouponSchema } from "./coupons.validation";
import { createCoupon, deleteCoupon, listCoupons, updateCoupon } from "./coupons.service";

function paramId(req: Request): string {
  return req.params.id as string;
}

async function requireOwnRestaurantId(req: Request, res: Response): Promise<string | null> {
  const restaurantId = await getOwnRestaurantId(req.user!.id);
  if (!restaurantId) {
    res.status(404).json({ error: new NoRestaurantError().message });
    return null;
  }
  return restaurantId;
}

export async function listCouponsHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;
  res.status(200).json({ coupons: await listCoupons(restaurantId) });
}

export async function createCouponHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = createCouponSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    res.status(201).json({ coupon: await createCoupon(restaurantId, parsed.data) });
  } catch (err) {
    if (err instanceof CouponCodeInUseError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function updateCouponHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = updateCouponSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    res.status(200).json({ coupon: await updateCoupon(restaurantId, paramId(req), parsed.data) });
  } catch (err) {
    if (err instanceof CouponNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function deleteCouponHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    await deleteCoupon(restaurantId, paramId(req));
    res.status(204).send();
  } catch (err) {
    if (err instanceof CouponNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}
