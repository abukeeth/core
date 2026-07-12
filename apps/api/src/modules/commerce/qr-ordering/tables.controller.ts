import type { Request, Response } from "express";
import { NoRestaurantError } from "../../restaurants/restaurant.errors";
import { getOwnRestaurantId } from "../../restaurants/restaurant.service";
import { InvalidQrTokenError, TableNotFoundError } from "./qr-ordering.errors";
import { createTableSchema, updateTableSchema } from "./qr-ordering.validation";
import { createTable, deleteTable, listTables, regenerateQrToken, resolveTableByToken, updateTable } from "./tables.service";

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

export async function listTablesHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;
  res.status(200).json({ tables: await listTables(restaurantId) });
}

export async function createTableHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = createTableSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  res.status(201).json({ table: await createTable(restaurantId, parsed.data) });
}

export async function updateTableHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = updateTableSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    res.status(200).json({ table: await updateTable(restaurantId, paramId(req), parsed.data) });
  } catch (err) {
    if (err instanceof TableNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function deleteTableHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    await deleteTable(restaurantId, paramId(req));
    res.status(204).send();
  } catch (err) {
    if (err instanceof TableNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function regenerateQrTokenHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    res.status(200).json({ table: await regenerateQrToken(restaurantId, paramId(req)) });
  } catch (err) {
    if (err instanceof TableNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

/** Public — resolves a scanned QR token. Never echoes qrToken back in the response body. */
export async function resolveTableHandler(req: Request, res: Response): Promise<void> {
  try {
    const table = await resolveTableByToken(req.params.qrToken as string);
    res.status(200).json({ table: { id: table.id, restaurantId: table.restaurantId, label: table.label } });
  } catch (err) {
    if (err instanceof InvalidQrTokenError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}
