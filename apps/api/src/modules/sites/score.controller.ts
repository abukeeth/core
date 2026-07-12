import type { Request, Response } from "express";
import { mapSiteError, paramId, requireOwnRestaurantId } from "./controller-helpers";
import { applySuggestion, getLatestScore, getScoreHistory, runScore } from "./score.service";
import { applySuggestionSchema } from "./site.validation";

export async function run(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const score = await runScore(restaurantId, paramId(req), paramId(req, "vid"));
    res.status(200).json({ score });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

export async function getLatest(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const score = await getLatestScore(restaurantId, paramId(req), paramId(req, "vid"));
    res.status(200).json({ score });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

export async function getHistory(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const history = await getScoreHistory(restaurantId, paramId(req), paramId(req, "vid"));
    res.status(200).json({ history });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

export async function applyFix(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = applySuggestionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const score = await applySuggestion(restaurantId, paramId(req), paramId(req, "vid"), parsed.data);
    res.status(200).json({ score });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}
