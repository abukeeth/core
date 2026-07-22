import type { Request, Response } from "express";
import { z } from "zod";
import { createLogger } from "../../lib/logger";
import {
  AdminDeleteConfirmationMismatchError,
  AdminTargetNotFoundError,
  CannotModifySelfError,
} from "./admin.errors";
import {
  deleteRestaurantCascade,
  listOrdersDetailed,
  listPaymentsDetailed,
  listRestaurantsDetailed,
  listUsers,
  setUserActive,
} from "./admin.service";

const logger = createLogger("admin.controller");

const listQuerySchema = z.object({
  query: z.string().trim().max(200).optional(),
  restaurantId: z.string().trim().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const setActiveSchema = z.object({ isActive: z.boolean() });
const deleteRestaurantSchema = z.object({ confirmName: z.string().min(1).max(200) });

function mapAdminError(err: unknown, res: Response): void {
  if (err instanceof AdminTargetNotFoundError) {
    res.status(404).json({ error: err.message });
    return;
  }
  if (err instanceof AdminDeleteConfirmationMismatchError) {
    res.status(400).json({ error: err.message, code: "CONFIRMATION_MISMATCH" });
    return;
  }
  if (err instanceof CannotModifySelfError) {
    res.status(400).json({ error: err.message });
    return;
  }
  logger.error({ err }, "admin request failed");
  res.status(500).json({ error: "Admin request failed" });
}

export async function listUsersHandler(req: Request, res: Response): Promise<void> {
  try {
    const { query, limit } = listQuerySchema.parse(req.query);
    res.json({ users: await listUsers(query, limit) });
  } catch (err) {
    mapAdminError(err, res);
  }
}

export async function setUserActiveHandler(req: Request, res: Response): Promise<void> {
  try {
    const { isActive } = setActiveSchema.parse(req.body);
    res.json({ user: await setUserActive(req.user!.id, String(req.params.id), isActive) });
  } catch (err) {
    mapAdminError(err, res);
  }
}

export async function listRestaurantsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { query, limit } = listQuerySchema.parse(req.query);
    res.json({ restaurants: await listRestaurantsDetailed(query, limit) });
  } catch (err) {
    mapAdminError(err, res);
  }
}

export async function listOrdersHandler(req: Request, res: Response): Promise<void> {
  try {
    const { restaurantId, limit } = listQuerySchema.parse(req.query);
    res.json({ orders: await listOrdersDetailed(restaurantId, limit) });
  } catch (err) {
    mapAdminError(err, res);
  }
}

export async function listPaymentsHandler(req: Request, res: Response): Promise<void> {
  try {
    const { limit } = listQuerySchema.parse(req.query);
    res.json({ payments: await listPaymentsDetailed(limit) });
  } catch (err) {
    mapAdminError(err, res);
  }
}

export async function deleteRestaurantHandler(req: Request, res: Response): Promise<void> {
  try {
    const { confirmName } = deleteRestaurantSchema.parse(req.body);
    await deleteRestaurantCascade(req.user!.id, String(req.params.id), confirmName);
    res.status(200).json({ deleted: true });
  } catch (err) {
    mapAdminError(err, res);
  }
}
