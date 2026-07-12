import type { Request, Response } from "express";
import { NoRestaurantError } from "../../restaurants/restaurant.errors";
import { getOwnRestaurantId } from "../../restaurants/restaurant.service";
import { DeliveryRuleNotFoundError, DeliveryZoneNotFoundError, InvalidFallbackRuleError } from "./delivery-zones.errors";
import {
  createDeliveryRuleSchema,
  createDeliveryZoneSchema,
  updateDeliveryRuleSchema,
  updateDeliveryZoneSchema,
} from "./delivery-zones.validation";
import { createRule, createZone, deleteRule, deleteZone, listRules, listZones, updateRule, updateZone } from "./zones.service";

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

export async function listZonesHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;
  res.status(200).json({ deliveryZones: await listZones(restaurantId) });
}

export async function createZoneHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = createDeliveryZoneSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  res.status(201).json({ deliveryZone: await createZone(restaurantId, parsed.data) });
}

export async function updateZoneHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = updateDeliveryZoneSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    res.status(200).json({ deliveryZone: await updateZone(restaurantId, paramId(req), parsed.data) });
  } catch (err) {
    if (err instanceof DeliveryZoneNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function deleteZoneHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    await deleteZone(restaurantId, paramId(req));
    res.status(204).send();
  } catch (err) {
    if (err instanceof DeliveryZoneNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function listRulesHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;
  res.status(200).json({ deliveryRules: await listRules(restaurantId) });
}

export async function createRuleHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = createDeliveryRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    res.status(201).json({ deliveryRule: await createRule(restaurantId, parsed.data) });
  } catch (err) {
    if (err instanceof InvalidFallbackRuleError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function updateRuleHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = updateDeliveryRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    res.status(200).json({ deliveryRule: await updateRule(restaurantId, paramId(req), parsed.data) });
  } catch (err) {
    if (err instanceof DeliveryRuleNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof InvalidFallbackRuleError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function deleteRuleHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    await deleteRule(restaurantId, paramId(req));
    res.status(204).send();
  } catch (err) {
    if (err instanceof DeliveryRuleNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}
