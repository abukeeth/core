import type { Request, Response } from "express";
import { mapSiteError, paramId, requireOwnRestaurantId } from "./controller-helpers";
import {
  getGenerationStatus,
  listVariations,
  regenerateVariations,
  selectVariation,
  startGeneration,
} from "./generation.service";

export async function generate(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const job = await startGeneration(restaurantId, paramId(req), req.user!.id);
    res.status(202).json({ job });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

export async function generationStatus(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const job = await getGenerationStatus(restaurantId, paramId(req));
    res.status(200).json({ job });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

export async function listVariationsHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const variations = await listVariations(restaurantId, paramId(req));
    res.status(200).json({ variations });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

export async function selectVariationHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const version = await selectVariation(restaurantId, paramId(req), paramId(req, "vid"));
    res.status(200).json({ version });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

export async function regenerate(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const job = await regenerateVariations(restaurantId, paramId(req), req.user!.id);
    res.status(202).json({ job });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}
