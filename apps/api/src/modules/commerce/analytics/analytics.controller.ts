import type { Request, Response } from "express";
import { NoRestaurantError } from "../../restaurants/restaurant.errors";
import { getOwnRestaurantId } from "../../restaurants/restaurant.service";
import { getRevenueSummary, getRevenueByDay, getTopItems } from "./analytics.service";
import { analyticsRangeSchema, topItemsSchema } from "./analytics.validation";

export async function getRevenueSummaryHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await getOwnRestaurantId(req.user!.id);
  if (!restaurantId) {
    res.status(404).json({ error: new NoRestaurantError().message });
    return;
  }
  const parsed = analyticsRangeSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  res.status(200).json(await getRevenueSummary(restaurantId, parsed.data.days));
}

export async function getRevenueByDayHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await getOwnRestaurantId(req.user!.id);
  if (!restaurantId) {
    res.status(404).json({ error: new NoRestaurantError().message });
    return;
  }
  const parsed = analyticsRangeSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  res.status(200).json({ days: await getRevenueByDay(restaurantId, parsed.data.days) });
}

export async function getTopItemsHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await getOwnRestaurantId(req.user!.id);
  if (!restaurantId) {
    res.status(404).json({ error: new NoRestaurantError().message });
    return;
  }
  const parsed = topItemsSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  res.status(200).json({ items: await getTopItems(restaurantId, parsed.data.days, parsed.data.limit) });
}
