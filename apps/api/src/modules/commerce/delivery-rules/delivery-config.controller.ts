import type { Request, Response } from "express";
import { NoRestaurantError } from "../../restaurants/restaurant.errors";
import { getOwnRestaurantId } from "../../restaurants/restaurant.service";
import { getConfig, updateConfig } from "./delivery-config.service";
import { updateDeliveryConfigSchema } from "./delivery-config.validation";

async function requireOwnRestaurantId(req: Request, res: Response): Promise<string | null> {
  const restaurantId = await getOwnRestaurantId(req.user!.id);
  if (!restaurantId) {
    res.status(404).json({ error: new NoRestaurantError().message });
    return null;
  }
  return restaurantId;
}

export async function getDeliveryConfigHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const config = await getConfig(restaurantId);
  res.status(200).json({ deliveryConfig: config });
}

export async function updateDeliveryConfigHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = updateDeliveryConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  const config = await updateConfig(restaurantId, parsed.data);
  res.status(200).json({ deliveryConfig: config });
}
