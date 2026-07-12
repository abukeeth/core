import type { Request, Response } from "express";
import { CustomerFavoriteNotFoundError } from "./customers.errors";
import { createFavoriteSchema } from "./customers.validation";
import { createFavorite, deleteFavorite, listFavorites } from "./favorites.service";

export async function listFavoritesHandler(req: Request, res: Response): Promise<void> {
  res.status(200).json({ favorites: await listFavorites(req.customer!.id) });
}

export async function createFavoriteHandler(req: Request, res: Response): Promise<void> {
  const parsed = createFavoriteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  res.status(201).json({ favorite: await createFavorite(req.customer!.id, parsed.data) });
}

export async function deleteFavoriteHandler(req: Request, res: Response): Promise<void> {
  try {
    await deleteFavorite(req.customer!.id, req.params.id as string);
    res.status(204).send();
  } catch (err) {
    if (err instanceof CustomerFavoriteNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}
