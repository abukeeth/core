import type { Request, Response } from "express";
import { RestaurantNotFoundError } from "../../restaurants/restaurant.errors";
import { getPublicMenu } from "./public-menu.service";

export async function getPublicMenuHandler(req: Request, res: Response): Promise<void> {
  try {
    const menu = await getPublicMenu(req.params.restaurantId as string);
    res.status(200).json(menu);
  } catch (err) {
    if (err instanceof RestaurantNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}
