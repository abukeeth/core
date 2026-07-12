import type { Request, Response } from "express";
import { MenuItemNotFoundError } from "./menu-commerce.errors";
import { requireOwnRestaurantId, revalidateInBackground } from "./menu-commerce.controller-helpers";
import { toggleOutOfStockSchema, updateInventorySchema } from "./menu-commerce.validation";
import { getInventory, toggleOutOfStock, updateInventory } from "./inventory.service";

function paramItemId(req: Request): string {
  return req.params.itemId as string;
}

export async function getInventoryHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    res.status(200).json({ inventory: await getInventory(restaurantId, paramItemId(req)) });
  } catch (err) {
    if (err instanceof MenuItemNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function updateInventoryHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = updateInventorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const inventory = await updateInventory(restaurantId, paramItemId(req), parsed.data);
    revalidateInBackground(restaurantId);
    res.status(200).json({ inventory });
  } catch (err) {
    if (err instanceof MenuItemNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function toggleOutOfStockHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = toggleOutOfStockSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const inventory = await toggleOutOfStock(restaurantId, paramItemId(req), parsed.data);
    revalidateInBackground(restaurantId);
    res.status(200).json({ inventory });
  } catch (err) {
    if (err instanceof MenuItemNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}
