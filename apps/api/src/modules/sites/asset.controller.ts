import type { SiteAsset } from "@prisma/client";
import type { Request, Response } from "express";
import { resolveAssetRenditionKey } from "../../lib/image-processing";
import { mapSiteError, paramId, requireOwnRestaurantId } from "./controller-helpers";
import { deleteAsset, listAssets, updateAsset, uploadAsset } from "./asset.service";
import { assetUrl } from "./renderer/asset-url";
import { updateAssetSchema, uploadAssetKindSchema } from "./site.validation";

/**
 * The frontend has no business replicating asset-url.ts's storage-backend
 * branching (local disk vs. proxied vs. direct-CDN) — that's exactly the
 * "one seam to swap" asset-url.ts's own doc comment describes. Resolving
 * it once here, the same way render-site.ts's resolveRenderAssets already
 * does for the storefront renderer, keeps it in the one place that knows.
 */
function withUrl(asset: SiteAsset) {
  return { ...asset, url: assetUrl(resolveAssetRenditionKey(asset, "card")) };
}

export async function upload(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = uploadAssetKindSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "A file upload is required" });
    return;
  }

  try {
    const asset = await uploadAsset(restaurantId, paramId(req), parsed.data.kind, {
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
    });
    res.status(201).json({ asset: withUrl(asset) });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

export async function list(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    const assets = await listAssets(restaurantId, paramId(req));
    res.status(200).json({ assets: assets.map(withUrl) });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

export async function update(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = updateAssetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    const asset = await updateAsset(restaurantId, paramId(req), paramId(req, "assetId"), parsed.data);
    res.status(200).json({ asset: withUrl(asset) });
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}

export async function remove(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    await deleteAsset(restaurantId, paramId(req), paramId(req, "assetId"));
    res.status(204).send();
  } catch (err) {
    if (!mapSiteError(err, res)) throw err;
  }
}
