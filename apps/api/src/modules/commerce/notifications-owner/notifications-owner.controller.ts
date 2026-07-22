import type { Request, Response } from "express";
import { NoRestaurantError } from "../../restaurants/restaurant.errors";
import { getOwnRestaurantId } from "../../restaurants/restaurant.service";
import { listOwnerNotifications } from "./notifications-owner.service";
import { notificationListSchema } from "./notifications-owner.validation";

export async function listNotificationsHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await getOwnRestaurantId(req.user!.id);
  if (!restaurantId) {
    res.status(404).json({ error: new NoRestaurantError().message });
    return;
  }
  const parsed = notificationListSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  res.status(200).json({ notifications: await listOwnerNotifications(restaurantId, parsed.data.limit) });
}
