/**
 * Sprint 5 · T3 — Curated stock library (the third tier of the impression
 * resolver: real → AI → THIS → premium SVG).
 *
 * Real, licensed, SELF-HOSTED photography matched to a business's vertical and
 * category. This module ships the matcher plus a typed manifest; the manifest is
 * intentionally EMPTY until a licensed image pack is loaded — no external
 * hotlinks, no fabricated assets — so today the resolver falls through to the
 * premium SVG floor. Populating STOCK_LIBRARY with self-hosted, licensed entries
 * lights up this tier with zero code change.
 */

export interface StockImage {
  /** Self-hosted asset path/URL. Never a third-party hotlink. */
  url: string;
  alt: string;
  /** Lowercase keywords this image satisfies (category names, item types, "hero"). */
  keywords: string[];
  /** Lowercase business-type / vertical hints this image suits. */
  verticals: string[];
}

/**
 * The curated manifest. EMPTY until a licensed, self-hosted image pack is added.
 * Every `url` must point at an asset served from OrderVora's own storage/bundle.
 */
export const STOCK_LIBRARY: StockImage[] = [];

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

/**
 * Pure matcher (exported for tests). Narrows to entries whose vertical relates to
 * the hint, then prefers one that also matches a keyword; falls back to the first
 * vertical match. Returns the asset URL, or undefined when nothing matches.
 */
export function matchStock(library: StockImage[], verticalHint: string | undefined, keywords: string[]): string | undefined {
  if (library.length === 0) return undefined;
  const v = verticalHint ? normalize(verticalHint) : "";
  const wanted = keywords.map(normalize).filter((w) => w.length > 0);

  const byVertical = v ? library.filter((s) => s.verticals.some((sv) => v.includes(sv) || sv.includes(v))) : [];
  const pool = byVertical.length > 0 ? byVertical : library;

  const keyworded = pool.find((s) => s.keywords.some((k) => wanted.some((w) => w.includes(k) || k.includes(w))));
  return (keyworded ?? pool[0])?.url;
}

/** Curated hero image for a business vertical, or undefined when none is available. */
export function stockHeroImage(verticalHint: string | undefined): string | undefined {
  return matchStock(STOCK_LIBRARY, verticalHint, ["hero"]);
}

/** Curated category/banner image for a category name, or undefined when none is available. */
export function stockCategoryImage(verticalHint: string | undefined, categoryName: string): string | undefined {
  return matchStock(STOCK_LIBRARY, verticalHint, [categoryName]);
}
