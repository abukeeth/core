import type { Request, Response } from "express";
import {
  MenuItemNotFoundError,
  ModifierGroupAlreadyAttachedError,
  ModifierGroupNotFoundError,
  ModifierOptionNotFoundError,
} from "./menu-commerce.errors";
import { requireOwnRestaurantId, revalidateInBackground } from "./menu-commerce.controller-helpers";
import {
  attachModifierGroupSchema,
  createModifierGroupSchema,
  createModifierOptionSchema,
  updateModifierGroupSchema,
  updateModifierOptionSchema,
} from "./menu-commerce.validation";
import {
  attachModifierGroupToItem,
  createModifierGroup,
  createModifierOption,
  deleteModifierGroup,
  deleteModifierOption,
  detachModifierGroupFromItem,
  listItemModifierGroups,
  listModifierGroups,
  updateModifierGroup,
  updateModifierOption,
} from "./modifiers.service";

function paramId(req: Request): string {
  return req.params.id as string;
}
function paramOptionId(req: Request): string {
  return req.params.optionId as string;
}
function paramItemId(req: Request): string {
  return req.params.itemId as string;
}
function paramModifierGroupId(req: Request): string {
  return req.params.modifierGroupId as string;
}

export async function listModifierGroupsHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;
  res.status(200).json({ modifierGroups: await listModifierGroups(restaurantId) });
}

export async function createModifierGroupHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = createModifierGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  res.status(201).json({ modifierGroup: await createModifierGroup(restaurantId, parsed.data) });
}

export async function updateModifierGroupHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = updateModifierGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    res.status(200).json({ modifierGroup: await updateModifierGroup(restaurantId, paramId(req), parsed.data) });
  } catch (err) {
    if (err instanceof ModifierGroupNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function deleteModifierGroupHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    await deleteModifierGroup(restaurantId, paramId(req));
    res.status(204).send();
  } catch (err) {
    if (err instanceof ModifierGroupNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function createModifierOptionHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = createModifierOptionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    res.status(201).json({ modifierOption: await createModifierOption(restaurantId, paramId(req), parsed.data) });
  } catch (err) {
    if (err instanceof ModifierGroupNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function updateModifierOptionHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = updateModifierOptionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    res
      .status(200)
      .json({ modifierOption: await updateModifierOption(restaurantId, paramId(req), paramOptionId(req), parsed.data) });
  } catch (err) {
    if (err instanceof ModifierGroupNotFoundError || err instanceof ModifierOptionNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function deleteModifierOptionHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    await deleteModifierOption(restaurantId, paramId(req), paramOptionId(req));
    res.status(204).send();
  } catch (err) {
    if (err instanceof ModifierGroupNotFoundError || err instanceof ModifierOptionNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function attachModifierGroupHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = attachModifierGroupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    await attachModifierGroupToItem(restaurantId, paramItemId(req), parsed.data);
    revalidateInBackground(restaurantId);
    res.status(201).json({ ok: true });
  } catch (err) {
    if (err instanceof MenuItemNotFoundError || err instanceof ModifierGroupNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof ModifierGroupAlreadyAttachedError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function detachModifierGroupHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    await detachModifierGroupFromItem(restaurantId, paramItemId(req), paramModifierGroupId(req));
    revalidateInBackground(restaurantId);
    res.status(204).send();
  } catch (err) {
    if (err instanceof MenuItemNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function listItemModifierGroupsHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    res.status(200).json({ attachments: await listItemModifierGroups(restaurantId, paramItemId(req)) });
  } catch (err) {
    if (err instanceof MenuItemNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}
