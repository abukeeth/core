import { waitUntil } from "@vercel/functions";
import type { Request, Response } from "express";
import { NoRestaurantError } from "../restaurants/restaurant.errors";
import { getOwnRestaurantId } from "../restaurants/restaurant.service";
import { revalidatePublishedSite } from "../sites/site.service";
import { CategoryNotFoundError, ItemNotFoundError } from "./menu.errors";
import {
  createCategory,
  createItem,
  deleteCategory,
  deleteItem,
  listCategories,
  updateCategory,
  updateItem,
} from "./menu.service";
import { createCategorySchema, createItemSchema, updateCategorySchema, updateItemSchema } from "./menu.validation";

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

/**
 * §19.4 Menu revalidation — fire-and-forget so editing the menu never
 * waits on re-rendering a published site; a no-op if the restaurant has
 * no published site. Errors are swallowed rather than surfaced to the
 * menu-edit response, since revalidation failing shouldn't fail the edit
 * itself (acceptance criterion #8: price change live within 60s).
 *
 * `waitUntil` (not a bare `void`) — same reasoning as job-runner.ts:
 * Vercel can freeze this invocation shortly after the HTTP response is
 * sent, killing a detached promise before revalidation finishes.
 */
function revalidateInBackground(restaurantId: string): void {
  waitUntil(revalidatePublishedSite(restaurantId).catch(() => undefined));
}

export async function listCategoriesHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const categories = await listCategories(restaurantId);
  res.status(200).json({ categories });
}

export async function createCategoryHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = createCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  const category = await createCategory(restaurantId, parsed.data);
  revalidateInBackground(restaurantId);
  res.status(201).json({ category });
}

export async function updateCategoryHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = updateCategorySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const category = await updateCategory(restaurantId, paramId(req), parsed.data);
    revalidateInBackground(restaurantId);
    res.status(200).json({ category });
  } catch (err) {
    if (err instanceof CategoryNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function deleteCategoryHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    await deleteCategory(restaurantId, paramId(req));
    revalidateInBackground(restaurantId);
    res.status(204).send();
  } catch (err) {
    if (err instanceof CategoryNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function createItemHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = createItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const item = await createItem(restaurantId, parsed.data);
    revalidateInBackground(restaurantId);
    res.status(201).json({ item });
  } catch (err) {
    if (err instanceof CategoryNotFoundError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function updateItemHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = updateItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const item = await updateItem(restaurantId, paramId(req), parsed.data);
    revalidateInBackground(restaurantId);
    res.status(200).json({ item });
  } catch (err) {
    if (err instanceof ItemNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof CategoryNotFoundError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function deleteItemHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    await deleteItem(restaurantId, paramId(req));
    revalidateInBackground(restaurantId);
    res.status(204).send();
  } catch (err) {
    if (err instanceof ItemNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}
