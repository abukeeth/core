import { waitUntil } from "@vercel/functions";
import type { Request, Response } from "express";
import { recordAuditLog } from "../admin/audit-log.service";
import { revalidatePublishedSite } from "../sites/site.service";
import { NoRestaurantError, RestaurantAlreadyExistsError, RestaurantNotFoundError } from "./restaurant.errors";
import {
  createRestaurant,
  getOwnRestaurant,
  getOwnRestaurantId,
  listAllRestaurants,
  listReferrals,
  setSetupStep,
  suspendRestaurant,
  unsuspendRestaurant,
  updateOwnRestaurant,
} from "./restaurant.service";
import {
  createRestaurantSchema,
  setSetupStepSchema,
  suspendRestaurantSchema,
  updateRestaurantSchema,
} from "./restaurant.validation";

/** §19.4 profile-change revalidation — see menu.controller.ts's revalidateInBackground for the same rationale. */
function revalidateInBackground(restaurantId: string): void {
  waitUntil(revalidatePublishedSite(restaurantId).catch(() => undefined));
}

export async function create(req: Request, res: Response): Promise<void> {
  const parsed = createRestaurantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const restaurant = await createRestaurant(req.user!.id, parsed.data);
    res.status(201).json({ restaurant });
  } catch (err) {
    if (err instanceof RestaurantAlreadyExistsError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function getMine(req: Request, res: Response): Promise<void> {
  try {
    const restaurant = await getOwnRestaurant(req.user!.id);
    res.status(200).json({ restaurant });
  } catch (err) {
    if (err instanceof NoRestaurantError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function updateMine(req: Request, res: Response): Promise<void> {
  const parsed = updateRestaurantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const restaurant = await updateOwnRestaurant(req.user!.id, parsed.data);
    revalidateInBackground(restaurant.id);
    res.status(200).json({ restaurant });
  } catch (err) {
    if (err instanceof NoRestaurantError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function setSetupStepHandler(req: Request, res: Response): Promise<void> {
  const parsed = setSetupStepSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const restaurant = await setSetupStep(req.user!.id, parsed.data.setupStep);
    res.status(200).json({ restaurant });
  } catch (err) {
    if (err instanceof NoRestaurantError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function listAll(_req: Request, res: Response): Promise<void> {
  const restaurants = await listAllRestaurants();
  res.status(200).json({ restaurants });
}

export async function getOwnReferrals(req: Request, res: Response): Promise<void> {
  const restaurantId = await getOwnRestaurantId(req.user!.id);
  if (!restaurantId) {
    res.status(404).json({ error: new NoRestaurantError().message });
    return;
  }
  const referrals = await listReferrals(restaurantId);
  res.status(200).json({ referrals });
}

export async function suspend(req: Request, res: Response): Promise<void> {
  const parsed = suspendRestaurantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const restaurant = await suspendRestaurant(req.params.id as string, parsed.data.reason);
    await recordAuditLog(req.user!.id, "RESTAURANT_SUSPENDED", "Restaurant", restaurant.id, { reason: parsed.data.reason });
    res.status(200).json({ restaurant });
  } catch (err) {
    if (err instanceof RestaurantNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function unsuspend(req: Request, res: Response): Promise<void> {
  try {
    const restaurant = await unsuspendRestaurant(req.params.id as string);
    await recordAuditLog(req.user!.id, "RESTAURANT_UNSUSPENDED", "Restaurant", restaurant.id);
    res.status(200).json({ restaurant });
  } catch (err) {
    if (err instanceof RestaurantNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}
