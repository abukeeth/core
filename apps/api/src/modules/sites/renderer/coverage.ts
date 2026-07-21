import type { LiveMenuCategory } from "./render-context";

/**
 * Sprint 5 · T1 — Coverage-Aware Layout.
 *
 * A generated storefront must look premium whether or not the business has
 * product photos. This module measures how much of a catalog actually carries
 * imagery and decides which catalog layout best presents it:
 *
 *   - low coverage  → a premium *typographic* menu (no image tiles), so a
 *     photo-less catalog reads as an intentional à-la-carte design rather than
 *     a wall of placeholder tiles.
 *   - high coverage → the theme's own photo-forward grid (warm-cards /
 *     bold-grid), unchanged.
 *
 * Pure, deterministic, and computed from the LIVE menu — so a catalog flips
 * layout the moment an owner adds enough photos, with no regeneration (the same
 * "menu renders from live data, never baked into the definition" contract §5
 * already establishes for renderMenuSection).
 */

/**
 * Below this fraction of items-with-images, a photo-forward catalog is rendered
 * as the typographic editorial menu instead. 0.35 ≈ "fewer than roughly a third
 * of items have a photo" — the point at which a photo grid starts to look
 * sparse and the typographic treatment reads more premium. The comparison is
 * strict (`< 0.35` → typographic; `>= 0.35` → keep the grid).
 */
export const COVERAGE_THRESHOLD = 0.35;

/** The premium typographic layout a low-coverage catalog falls back to. */
export const TYPOGRAPHIC_CATALOG_VARIANT = "editorial-menu";

/**
 * The photo-forward catalog variants coverage-awareness is allowed to override.
 * Deliberately limited to the active Theme-Engine-V3 grids. Already-typographic
 * variants (editorial-menu, editorial-rows) need no override, and deprecated /
 * legacy variants (card-grid, two-column-elegant, classic-list) plus the
 * default (undefined) path are intentionally excluded so existing and
 * deprecated themes keep rendering byte-identically.
 */
const PHOTO_FORWARD_VARIANTS: ReadonlySet<string> = new Set(["warm-cards", "bold-grid"]);

/**
 * Fraction (0..1) of catalog items that carry an image. Counts every item
 * across the given categories; an item "has an image" when its `imageUrl` is a
 * non-empty string. Returns 0 for an empty catalog — the caller renders its own
 * "menu coming soon" state in that case, so the value is moot there.
 */
export function catalogImageCoverage(categories: LiveMenuCategory[]): number {
  let total = 0;
  let withImage = 0;
  for (const category of categories) {
    for (const item of category.items) {
      total += 1;
      if (typeof item.imageUrl === "string" && item.imageUrl.trim() !== "") {
        withImage += 1;
      }
    }
  }
  return total === 0 ? 0 : withImage / total;
}

/**
 * The effective catalog layout, given the theme's declared variant and the live
 * image coverage. A photo-forward grid whose coverage is below
 * COVERAGE_THRESHOLD is presented as the typographic menu instead; every other
 * case returns the variant unchanged (including `undefined`, which the renderer
 * resolves to its default layout).
 */
export function selectCatalogLayout(variant: string | undefined, coverage: number): string | undefined {
  if (variant !== undefined && PHOTO_FORWARD_VARIANTS.has(variant) && coverage < COVERAGE_THRESHOLD) {
    return TYPOGRAPHIC_CATALOG_VARIANT;
  }
  return variant;
}
