import type { Request, Response } from "express";
import { getOwnRestaurant } from "../restaurants/restaurant.service";
import { mapSiteError, paramId, requireOwnRestaurantId } from "./controller-helpers";
import { signPreviewToken } from "./preview-token";
import {
  createSite,
  getOwnSite,
  getOwnSiteById,
  getVersion,
  listReleases,
  listVersions,
  patchDraft,
  publishSite,
  renderDraftPreview,
  resolveSiteUrl,
  rollbackSite,
  temporaryDomainFor,
  unpublishSite,
  updateSite,
  validatePublishReadiness,
} from "./site.service";
import { patchDraftSchema, renderPreviewSchema, updateSiteSchema } from "./site.validation";

export async function getMine(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const site = await getOwnSite(restaurantId);
    const url = await resolveSiteUrl(site);
    const temporaryDomain = `https://${temporaryDomainFor(site)}`;
    res.status(200).json({ site, url, temporaryDomain });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

export async function create(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const restaurant = await getOwnRestaurant(req.user!.id);
    const site = await createSite(restaurantId, restaurant.name);
    res.status(201).json({ site });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = updateSiteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const site = await updateSite(restaurantId, paramId(req), parsed.data);
    res.status(200).json({ site });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

export async function listVersionsHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const versions = await listVersions(restaurantId, paramId(req));
    res.status(200).json({ versions });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

export async function getVersionHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const version = await getVersion(restaurantId, paramId(req), paramId(req, "vid"));
    res.status(200).json({ version });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

export async function patchDraftHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = patchDraftSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const version = await patchDraft(restaurantId, paramId(req), parsed.data);
    res.status(200).json({ version });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

/** POST /api/sites/:id/draft/render — Customization Studio live preview; renders an unsaved candidate definition with the real renderer, never persists it. */
export async function renderDraftPreviewHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = renderPreviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const html = await renderDraftPreview(restaurantId, paramId(req), parsed.data.definition, parsed.data.path ?? "/");
    if (html === null) {
      res.status(404).json({ error: "No page at that path in this definition" });
      return;
    }
    res.status(200).json({ html });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

export async function publish(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const result = await publishSite(restaurantId, paramId(req), req.user!.id);
    res.status(200).json(result);
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

/** GET /api/sites/:id/publish-check — read-only pre-publish validation the Studio calls before starting the staged publish flow. */
export async function checkPublishReadiness(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const readiness = await validatePublishReadiness(restaurantId, paramId(req));
    res.status(200).json(readiness);
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

export async function listReleasesHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const releases = await listReleases(restaurantId, paramId(req));
    res.status(200).json({ releases });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

export async function rollback(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const site = await rollbackSite(restaurantId, paramId(req), paramId(req, "vid"));
    res.status(200).json({ site });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

/** GET /api/sites/:id/preview-token — a short-lived, site-scoped token the dashboard embeds into a /preview/:token?path=...&variation=... URL. */
export async function previewToken(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const site = await getOwnSiteById(restaurantId, paramId(req));
    res.status(200).json({ token: signPreviewToken(site.id) });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

export async function unpublish(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const site = await unpublishSite(restaurantId, paramId(req));
    res.status(200).json({ site });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}
