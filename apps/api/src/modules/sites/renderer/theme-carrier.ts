import { relativeLuminance } from "../../../lib/color";
import type { SiteDefinition, ThemeCatalogEntry } from "../types";

/**
 * Generation V2 — the render carrier for theme-free definitions.
 *
 * A schemaVersion-2 definition carries its complete visual identity in its own
 * tokens (brandSettings + typography + per-section variants); nothing is
 * selected from a catalog. The renderer's internals, however, are typed around
 * `ThemeCatalogEntry`, so this synthesizes a carrier object FROM the
 * definition — a typed adapter, not a theme: every value here is derived from
 * what the generation pipeline already decided.
 *
 * The styleFamily slot is repurposed as a LEGIBILITY persona for theme-css's
 * micro-typography (tracking/leading/section rhythm), chosen from the ground's
 * luminance: dark grounds read best tight, light grounds airy, tinted grounds
 * relaxed. It never selects layout, sections, fonts, or color.
 */
export function buildCarrierTheme(definition: SiteDefinition): ThemeCatalogEntry {
  const ground = definition.brandSettings?.backgroundColor;
  const luminance = ground ? relativeLuminance(ground) : 0.9;
  const persona = luminance < 0.35 ? "LUXURY" : luminance > 0.8 ? "MODERN" : "MINIMAL";

  const radiusPx = definition.brandSettings?.borderRadius ?? 8;
  const radius = radiusPx <= 5 ? "sharp" : radiusPx <= 13 ? "soft" : "rounded";

  return {
    key: "generated",
    version: 1,
    styleFamily: persona,
    personalityVector: { traditionalContemporary: 0.5, casualFormal: 0.5, playfulSerious: 0.5, understatedBold: 0.5, rusticPolished: 0.5 },
    cuisineAffinities: {},
    constraints: {},
    tokens: {
      colorSeed: definition.colorSeed,
      typography: definition.typography,
      radius,
      motion: "subtle",
      typeScaleRatio: 1.28,
    },
    variants: { hero: [], menuLayout: [], chrome: ["standard"] },
    layouts: { home: [] },
  };
}

/** True when a definition renders through the carrier instead of the catalog. */
export function isThemeFreeDefinition(definition: SiteDefinition): boolean {
  return definition.schemaVersion === 2;
}
