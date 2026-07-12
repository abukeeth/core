import { waitUntil } from "@vercel/functions";
import type { Request, Response } from "express";
import { NoRestaurantError } from "../../restaurants/restaurant.errors";
import { getOwnRestaurantId } from "../../restaurants/restaurant.service";
import { revalidatePublishedSite } from "../../sites/site.service";

export async function requireOwnRestaurantId(req: Request, res: Response): Promise<string | null> {
  const restaurantId = await getOwnRestaurantId(req.user!.id);
  if (!restaurantId) {
    res.status(404).json({ error: new NoRestaurantError().message });
    return null;
  }
  return restaurantId;
}

/**
 * Fire-and-forget so menu-commerce edits never wait on re-rendering a
 * published site — mirrors menu.controller.ts's revalidateInBackground
 * exactly (Sprint 06 acceptance criterion #8: change live within 60s),
 * including its use of `waitUntil` to survive Vercel's post-response
 * execution freeze.
 */
export function revalidateInBackground(restaurantId: string): void {
  waitUntil(revalidatePublishedSite(restaurantId).catch(() => undefined));
}
