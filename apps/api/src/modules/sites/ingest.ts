import { prisma } from "../../lib/prisma";
import type { IngestData } from "./types";

/**
 * Ingest stage (§2 stage 1): loads everything the generator needs from the
 * restaurant/menu data Sprints 01-05 already built. Read-only, tenant-scoped
 * by restaurantId (callers already resolve that via getOwnRestaurantId).
 *
 * `logoColorSeed` is intentionally always undefined for now — automatic
 * color extraction from an uploaded logo image isn't implemented in this
 * sprint (see Known Limitations); theme selection falls back to a
 * cuisine-based color hint instead (see theme-matching.ts).
 */
export async function ingestRestaurantData(restaurantId: string): Promise<IngestData> {
  const restaurant = await prisma.restaurant.findUniqueOrThrow({
    where: { id: restaurantId },
    include: { categories: { include: { items: { orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } } },
  });

  const assetPhotoCount = await prisma.siteAsset.count({
    where: { site: { restaurantId }, kind: { in: ["HERO", "GALLERY"] } },
  });

  const menu = restaurant.categories.flatMap((category) =>
    category.items
      .filter((item) => item.isAvailable)
      .map((item) => ({
        categoryName: category.name,
        name: item.name,
        description: item.description ?? undefined,
        priceCents: item.priceCents,
      })),
  );

  return {
    restaurantId: restaurant.id,
    restaurantName: restaurant.name,
    description: restaurant.description ?? undefined,
    address: restaurant.address ?? undefined,
    phone: restaurant.phone ?? undefined,
    menu,
    photoCount: assetPhotoCount,
    logoColorSeed: undefined,
    businessType: restaurant.businessType,
  };
}
