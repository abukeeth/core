import type { Request, Response } from "express";
import { NoRestaurantError } from "../../restaurants/restaurant.errors";
import { getOwnRestaurantId } from "../../restaurants/restaurant.service";
import { DeliveryFeeRuleNotFoundError, ServiceFeeRuleNotFoundError } from "./fee-rules.errors";
import {
  createDeliveryFeeRule,
  createServiceFeeRule,
  deleteDeliveryFeeRule,
  deleteServiceFeeRule,
  listDeliveryFeeRules,
  listServiceFeeRules,
  updateDeliveryFeeRule,
  updateServiceFeeRule,
} from "./fee-rules.service";
import {
  createDeliveryFeeRuleSchema,
  createServiceFeeRuleSchema,
  updateDeliveryFeeRuleSchema,
  updateServiceFeeRuleSchema,
} from "./fee-rules.validation";

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

export async function listDeliveryFeeRulesHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;
  res.status(200).json({ deliveryFeeRules: await listDeliveryFeeRules(restaurantId) });
}

export async function createDeliveryFeeRuleHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = createDeliveryFeeRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  const rule = await createDeliveryFeeRule(restaurantId, parsed.data);
  res.status(201).json({ deliveryFeeRule: rule });
}

export async function updateDeliveryFeeRuleHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = updateDeliveryFeeRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const rule = await updateDeliveryFeeRule(restaurantId, paramId(req), parsed.data);
    res.status(200).json({ deliveryFeeRule: rule });
  } catch (err) {
    if (err instanceof DeliveryFeeRuleNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function deleteDeliveryFeeRuleHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    await deleteDeliveryFeeRule(restaurantId, paramId(req));
    res.status(204).send();
  } catch (err) {
    if (err instanceof DeliveryFeeRuleNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function listServiceFeeRulesHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;
  res.status(200).json({ serviceFeeRules: await listServiceFeeRules(restaurantId) });
}

export async function createServiceFeeRuleHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = createServiceFeeRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  const rule = await createServiceFeeRule(restaurantId, parsed.data);
  res.status(201).json({ serviceFeeRule: rule });
}

export async function updateServiceFeeRuleHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = updateServiceFeeRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const rule = await updateServiceFeeRule(restaurantId, paramId(req), parsed.data);
    res.status(200).json({ serviceFeeRule: rule });
  } catch (err) {
    if (err instanceof ServiceFeeRuleNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function deleteServiceFeeRuleHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    await deleteServiceFeeRule(restaurantId, paramId(req));
    res.status(204).send();
  } catch (err) {
    if (err instanceof ServiceFeeRuleNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}
