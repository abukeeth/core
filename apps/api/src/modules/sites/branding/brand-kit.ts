/**
 * Sprint 5.5 — Brand Kit types.
 *
 * The Brand Kit is the unit of per-business identity. Themes own layout &
 * structure only; the Brand Kit owns **all color, vocabulary, tone, tagline,
 * story, and imagery direction**. Generated once per business (AI when enabled,
 * a deterministic vertical fallback otherwise) and consumed downstream by the
 * assembler (color + vocabulary) and the image generators (art-direction).
 */

/** The complete color identity — the sole source of storefront color. */
export interface BrandPalette {
  primary: string;
  secondary?: string;
  accent: string;
  background: string;
  text: string;
}

/** Vertical-aware wording so a vape shop never says "Dishes". */
export interface Vocabulary {
  /** The catalog page/section noun: "Menu" | "Shop". */
  catalogNoun: string;
  /** A single sellable unit: "Dish" | "Product" | "Drink". */
  itemNoun: string;
  itemPlural: string;
  /** Category count unit, e.g. "3 products" vs "3 dishes". */
  categoryUnitSingular: string;
  categoryUnitPlural: string;
  /** Primary call-to-action label: "Order Now" | "Shop Now" | "Order Pickup". */
  primaryCta: string;
  /** Section eyebrow/heading, e.g. "Explore the menu" | "Shop the collection". */
  exploreLabel: string;
}

/** Brand voice used to keep all generated copy consistent. */
export interface Tone {
  voice: string;
  adjectives: string[];
}

/** One image surface's art-direction brief — consumed by the 5.5.3 generators. */
export interface SurfaceBrief {
  subject: string;
  mood: string;
  lighting: string;
  composition: string;
  /** Steer-away directives (text/logos/branded products/people, …). */
  negativePrompt: string;
}

export interface ArtDirection {
  hero: SurfaceBrief;
  category: SurfaceBrief;
  marketing: SurfaceBrief;
}

/** A deterministic per-vertical base used both as the fallback and as the AI's grounding. */
export interface VerticalProfile {
  vertical: string;
  vocabulary: Vocabulary;
  tone: Tone;
  /** Deterministic, WCAG-valid palette (validated by the vertical-profiles test). */
  palette: BrandPalette;
  /** Combined as `${businessName} — ${taglineSuffix}` (never food-biased for non-food). */
  taglineSuffix: string;
  /** `{name}` is substituted with the business name when no real description exists. */
  brandStoryDefault: string;
  artDirection: ArtDirection;
}

export type BrandKitSource = "ai" | "fallback";

export interface BrandKit {
  vertical: string;
  palette: BrandPalette;
  vocabulary: Vocabulary;
  tone: Tone;
  tagline: string;
  brandStory: string;
  artDirection: ArtDirection;
  /** Provenance for telemetry/debugging — never used for rendering decisions. */
  source: BrandKitSource;
}
