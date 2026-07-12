import type { POSProviderType } from "@prisma/client";
import type { Request, Response } from "express";
import { NoRestaurantError } from "../../restaurants/restaurant.errors";
import { getOwnRestaurantId } from "../../restaurants/restaurant.service";
import { POSProviderNotFoundError, POSProviderNotImplementedError } from "./pos.errors";
import {
  connectProvider,
  disconnectProvider,
  listProviders,
  listSyncLogs,
  triggerSync,
  updateSyncDirection,
} from "./pos.service";
import { connectPOSProviderSchema, updateSyncDirectionSchema } from "./pos.validation";

function paramProviderType(req: Request): POSProviderType {
  return req.params.type as POSProviderType;
}

async function requireOwnRestaurantId(req: Request, res: Response): Promise<string | null> {
  const restaurantId = await getOwnRestaurantId(req.user!.id);
  if (!restaurantId) {
    res.status(404).json({ error: new NoRestaurantError().message });
    return null;
  }
  return restaurantId;
}

export async function listProvidersHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;
  res.status(200).json({ posProviders: await listProviders(restaurantId) });
}

export async function connectProviderHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = connectPOSProviderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const provider = await connectProvider(restaurantId, paramProviderType(req), parsed.data);
    res.status(200).json({ posProvider: provider });
  } catch (err) {
    if (err instanceof POSProviderNotImplementedError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function disconnectProviderHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    res.status(200).json({ posProvider: await disconnectProvider(restaurantId, paramProviderType(req)) });
  } catch (err) {
    if (err instanceof POSProviderNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function updateSyncDirectionHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = updateSyncDirectionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const provider = await updateSyncDirection(restaurantId, paramProviderType(req), parsed.data.syncDirection);
    res.status(200).json({ posProvider: provider });
  } catch (err) {
    if (err instanceof POSProviderNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function triggerSyncHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    await triggerSync(restaurantId, paramProviderType(req));
  } catch (err) {
    if (err instanceof POSProviderNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof POSProviderNotImplementedError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function listSyncLogsHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    res.status(200).json({ syncLogs: await listSyncLogs(restaurantId, paramProviderType(req)) });
  } catch (err) {
    if (err instanceof POSProviderNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}
