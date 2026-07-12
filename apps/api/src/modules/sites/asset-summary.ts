import { prisma } from "../../lib/prisma";
import type { AssetSummary } from "./types";

/** Summarizes SiteAsset state for the scorers, so they stay pure/DB-free. */
export async function getAssetSummary(siteId: string): Promise<AssetSummary> {
  const assets = await prisma.siteAsset.findMany({
    where: { siteId, kind: { in: ["HERO", "GALLERY"] } },
    select: { altText: true, renditions: true },
  });

  return {
    totalPhotoAssets: assets.length,
    altTextMissingCount: assets.filter((asset) => !asset.altText).length,
    unprocessedRenditionsCount: assets.filter((asset) => !asset.renditions).length,
  };
}
