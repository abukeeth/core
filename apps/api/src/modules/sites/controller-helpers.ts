import type { Request, Response } from "express";
import { NoRestaurantError } from "../restaurants/restaurant.errors";
import { getOwnRestaurantId } from "../restaurants/restaurant.service";
import {
  AssetNotFoundError,
  DomainAlreadyClaimedError,
  DomainNotFoundError,
  InvalidDomainError,
  NoPublishedVersionError,
  PrePublishCheckFailedError,
  SiteAlreadyExistsError,
  SiteNotFoundError,
  SiteVersionNotFoundError,
  SlugNotEditableError,
  SuggestionNotFoundError,
  VariationNotFoundError,
} from "./site.errors";

export async function requireOwnRestaurantId(req: Request, res: Response): Promise<string | null> {
  const restaurantId = await getOwnRestaurantId(req.user!.id);
  if (!restaurantId) {
    res.status(404).json({ error: new NoRestaurantError().message });
    return null;
  }
  return restaurantId;
}

export function paramId(req: Request, name = "id"): string {
  return req.params[name] as string;
}

/**
 * Shared error->HTTP mapping for every sites controller, so the
 * instanceof-based dispatch (same pattern as import.controller.ts) isn't
 * repeated in ten near-identical catch blocks. Returns true if it handled
 * the error (response already sent); false means the caller should rethrow.
 */
export function mapSiteError(err: unknown, res: Response): boolean {
  if (
    err instanceof SiteNotFoundError ||
    err instanceof SiteVersionNotFoundError ||
    err instanceof AssetNotFoundError ||
    err instanceof DomainNotFoundError ||
    err instanceof SuggestionNotFoundError ||
    err instanceof VariationNotFoundError
  ) {
    res.status(404).json({ error: err.message });
    return true;
  }
  if (err instanceof SiteAlreadyExistsError || err instanceof DomainAlreadyClaimedError) {
    res.status(409).json({ error: err.message });
    return true;
  }
  if (err instanceof PrePublishCheckFailedError) {
    res.status(422).json({ error: err.message, issues: err.issues });
    return true;
  }
  if (err instanceof NoPublishedVersionError) {
    res.status(409).json({ error: err.message });
    return true;
  }
  if (err instanceof InvalidDomainError || err instanceof SlugNotEditableError) {
    res.status(400).json({ error: err.message });
    return true;
  }
  return false;
}
