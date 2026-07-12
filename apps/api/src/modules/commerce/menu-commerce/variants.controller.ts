import type { Request, Response } from "express";
import { MenuItemNotFoundError, VariantNotFoundError } from "./menu-commerce.errors";
import { createVariantSchema, updateVariantSchema } from "./menu-commerce.validation";
import { createVariant, deleteVariant, listVariants, updateVariant } from "./variants.service";
import { requireOwnRestaurantId, revalidateInBackground } from "./menu-commerce.controller-helpers";

function paramItemId(req: Request): string {
  return req.params.itemId as string;
}

function paramVariantId(req: Request): string {
  return req.params.variantId as string;
}

export async function listVariantsHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    res.status(200).json({ variants: await listVariants(restaurantId, paramItemId(req)) });
  } catch (err) {
    if (err instanceof MenuItemNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function createVariantHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = createVariantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const variant = await createVariant(restaurantId, paramItemId(req), parsed.data);
    revalidateInBackground(restaurantId);
    res.status(201).json({ variant });
  } catch (err) {
    if (err instanceof MenuItemNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function updateVariantHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = updateVariantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const variant = await updateVariant(restaurantId, paramItemId(req), paramVariantId(req), parsed.data);
    revalidateInBackground(restaurantId);
    res.status(200).json({ variant });
  } catch (err) {
    if (err instanceof MenuItemNotFoundError || err instanceof VariantNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function deleteVariantHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    await deleteVariant(restaurantId, paramItemId(req), paramVariantId(req));
    revalidateInBackground(restaurantId);
    res.status(204).send();
  } catch (err) {
    if (err instanceof MenuItemNotFoundError || err instanceof VariantNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}
