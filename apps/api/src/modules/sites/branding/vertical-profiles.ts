import type { BrandProfile } from "../types";
import type { ArtDirection, VerticalProfile } from "./brand-kit";

/**
 * Sprint 5.5 — deterministic, vertical-aware brand profiles.
 *
 * Each profile is the fallback Brand Kit for its vertical (used when AI is off
 * or fails) AND the grounding the AI Brand Generator builds on. Every palette
 * here is WCAG-valid (asserted by the vertical-profiles test). Vocabulary and
 * tone are vertical-correct — this is what stops a vape shop from saying
 * "Dishes" or "great food".
 */

const BASE_NEGATIVE = "text, words, letters, typography, watermark, logo, brand name, signage, people, faces, hands, deformed, low quality";

function artDirection(hero: string, category: string, marketing: string, extraNegative = ""): ArtDirection {
  const negativePrompt = extraNegative ? `${BASE_NEGATIVE}, ${extraNegative}` : BASE_NEGATIVE;
  return {
    hero: { subject: hero, mood: "premium, on-brand", lighting: "professional", composition: "wide hero still-life", negativePrompt },
    category: { subject: category, mood: "clean, appetizing", lighting: "even", composition: "portrait category tile", negativePrompt },
    marketing: { subject: marketing, mood: "inviting, trustworthy", lighting: "bright", composition: "lifestyle banner", negativePrompt },
  };
}

export const DEFAULT_VERTICAL = "OTHER";

export const VERTICAL_PROFILES: Record<string, VerticalProfile> = {
  RESTAURANT: {
    vertical: "RESTAURANT",
    vocabulary: { catalogNoun: "Menu", itemNoun: "Dish", itemPlural: "Dishes", categoryUnitSingular: "dish", categoryUnitPlural: "dishes", primaryCta: "Order Now", exploreLabel: "Explore the menu" },
    tone: { voice: "refined and warm", adjectives: ["crafted", "seasonal", "inviting"] },
    palette: { primary: "#5C1A2B", accent: "#8A6A34", background: "#FBF7F0", text: "#2A211C" },
    taglineSuffix: "great food, made with care",
    brandStoryDefault: "{name} serves crafted, seasonal plates in a warm, welcoming room.",
    artDirection: artDirection("a beautifully plated signature dish on a dark table", "a category of plated dishes", "a warm dining-room lifestyle scene"),
  },
  COFFEE_SHOP: {
    vertical: "COFFEE_SHOP",
    vocabulary: { catalogNoun: "Menu", itemNoun: "Drink", itemPlural: "Drinks", categoryUnitSingular: "drink", categoryUnitPlural: "drinks", primaryCta: "Order Pickup", exploreLabel: "Explore the menu" },
    tone: { voice: "warm and inviting", adjectives: ["small-batch", "artisan", "cozy", "fresh"] },
    palette: { primary: "#6F4A2E", accent: "#8A5A2C", background: "#FBF6EE", text: "#33291F" },
    taglineSuffix: "small-batch coffee, crafted daily",
    brandStoryDefault: "{name} pours small-batch espresso and pour-over with fresh pastries every morning.",
    artDirection: artDirection("a latte with steam and pastries on a warm wooden counter", "a category of coffee drinks and pastries", "a cozy cafe morning scene"),
  },
  DELI: {
    vertical: "DELI",
    vocabulary: { catalogNoun: "Menu", itemNoun: "Item", itemPlural: "Items", categoryUnitSingular: "item", categoryUnitPlural: "items", primaryCta: "Order Now", exploreLabel: "Explore the menu" },
    tone: { voice: "hearty and no-nonsense", adjectives: ["fresh", "made-to-order", "generous", "local"] },
    palette: { primary: "#2F6B3A", accent: "#8A6D1F", background: "#FAFAF5", text: "#22261F" },
    taglineSuffix: "fresh sandwiches, made to order",
    brandStoryDefault: "{name} makes fresh sandwiches, hot plates, and breakfast to order.",
    artDirection: artDirection("overhead stacked sandwiches and fresh ingredients", "a category of deli items", "a bright deli-counter scene"),
  },
  VAPE_SHOP: {
    vertical: "VAPE_SHOP",
    vocabulary: { catalogNoun: "Shop", itemNoun: "Product", itemPlural: "Products", categoryUnitSingular: "product", categoryUnitPlural: "products", primaryCta: "Shop Now", exploreLabel: "Shop the collection" },
    tone: { voice: "bold and modern", adjectives: ["premium", "authentic", "cutting-edge", "trusted"] },
    palette: { primary: "#7C3AED", accent: "#22D3EE", background: "#0B0713", text: "#ECEAF2" },
    taglineSuffix: "premium vapes you can trust",
    brandStoryDefault: "{name} is your trusted local shop for premium vapes, e-liquids, and accessories.",
    artDirection: artDirection(
      "sleek modern vaping devices arranged on dark stone with neon rim light",
      "an abstract dark product category scene",
      "a modern dark-studio lifestyle banner",
      "cigarettes, smoke health warnings, specific branded devices, tobacco leaves",
    ),
  },
  RETAIL: {
    vertical: "RETAIL",
    vocabulary: { catalogNoun: "Shop", itemNoun: "Product", itemPlural: "Products", categoryUnitSingular: "product", categoryUnitPlural: "products", primaryCta: "Shop Now", exploreLabel: "Shop the collection" },
    tone: { voice: "clean and confident", adjectives: ["curated", "quality", "modern"] },
    palette: { primary: "#1F4FD8", accent: "#B4531F", background: "#FFFFFF", text: "#1A1A1A" },
    taglineSuffix: "quality products, curated for you",
    brandStoryDefault: "{name} offers a curated selection of quality products with fast, friendly service.",
    artDirection: artDirection("a clean product arrangement on a neutral surface", "a curated product category", "a modern retail lifestyle banner"),
  },
  OTHER: {
    vertical: "OTHER",
    vocabulary: { catalogNoun: "Menu", itemNoun: "Item", itemPlural: "Items", categoryUnitSingular: "item", categoryUnitPlural: "items", primaryCta: "Order Now", exploreLabel: "Explore" },
    tone: { voice: "friendly and clear", adjectives: ["local", "quality", "trusted"] },
    palette: { primary: "#2563EB", accent: "#B45309", background: "#FFFFFF", text: "#1A1A1A" },
    taglineSuffix: "quality you can count on",
    brandStoryDefault: "{name} is a local business focused on quality and friendly service.",
    artDirection: artDirection("an inviting, on-brand lifestyle scene", "a clean product category", "a welcoming lifestyle banner"),
  },
};

/** Keyword inference from a free-text business-type string (fallback when no enum vertical is passed). */
const KEYWORD_TO_VERTICAL: [RegExp, string][] = [
  [/vape|smoke|tobacco|hookah|nicotine/i, "VAPE_SHOP"],
  [/coffee|cafe|café|espresso|roaster/i, "COFFEE_SHOP"],
  [/deli\b|delicatessen|sandwich|sub\b|hoagie|pastrami|bodega/i, "DELI"],
  [/retail|store|shop|boutique/i, "RETAIL"],
  [/restaurant|bistro|grill|kitchen|eatery|diner|taqueria|pizzeria/i, "RESTAURANT"],
];

/**
 * The two "default-ish" enum values. RESTAURANT is the wizard's first tile and
 * the historical default; OTHER is the schema default. Either can be overridden
 * by strong contrary evidence. A SPECIFIC choice (DELI, VAPE_SHOP, …) never is.
 */
const OVERRIDABLE_VERTICALS = new Set(["RESTAURANT", "OTHER"]);

export interface VerticalEvidence {
  /** The business's display name — a "Deli" in the name beats a default enum. */
  businessName?: string;
  /** Imported menu category names — e.g. "Signature Sandwiches", "Deli Classics". */
  menuCategories?: string[];
}

function inferFromText(text: string): string | undefined {
  for (const [pattern, key] of KEYWORD_TO_VERTICAL) {
    if (pattern.test(text)) return key;
  }
  return undefined;
}

/**
 * Evidence-based override for a default-ish vertical: the business NAME naming
 * a vertical wins outright; otherwise two or more distinct menu categories
 * pointing at the same non-restaurant vertical win. One stray "Sandwiches"
 * category on a real restaurant menu is NOT enough to reclassify it.
 */
function inferFromEvidence(evidence: VerticalEvidence): string | undefined {
  const fromName = evidence.businessName ? inferFromText(evidence.businessName) : undefined;
  if (fromName && fromName !== "RESTAURANT") return fromName;

  const hits = new Map<string, number>();
  for (const category of evidence.menuCategories ?? []) {
    const hit = inferFromText(category);
    if (hit && hit !== "RESTAURANT") hits.set(hit, (hits.get(hit) ?? 0) + 1);
  }
  const strongest = [...hits.entries()].sort((a, b) => b[1] - a[1])[0];
  return strongest && strongest[1] >= 2 ? strongest[0] : undefined;
}

/**
 * Resolve the vertical key. A SPECIFIC explicit enum vertical always wins; a
 * default-ish one (RESTAURANT/OTHER — the tap-the-first-tile / schema-default
 * values) is overridden when the business name or the imported menu carries
 * strong evidence of the real vertical (e.g. "DELI Fresh & Local" with
 * "Signature Sandwiches" + "Deli Classics" is a DELI even if the wizard stored
 * RESTAURANT). Falls back to free-text inference, then the DEFAULT profile.
 */
export function resolveVertical(vertical: string | undefined, brandProfile: BrandProfile, evidence: VerticalEvidence = {}): string {
  const explicit = vertical && VERTICAL_PROFILES[vertical.toUpperCase()] ? vertical.toUpperCase() : undefined;
  if (explicit && !OVERRIDABLE_VERTICALS.has(explicit)) return explicit;

  const evidenced = inferFromEvidence(evidence);
  if (evidenced) return evidenced;
  if (explicit) return explicit;

  const hint = `${brandProfile.businessType ?? ""}`;
  return inferFromText(hint) ?? DEFAULT_VERTICAL;
}

/** The deterministic profile for a vertical (falls back to the DEFAULT/OTHER profile). */
export function getVerticalProfile(vertical: string): VerticalProfile {
  return VERTICAL_PROFILES[vertical.toUpperCase()] ?? VERTICAL_PROFILES[DEFAULT_VERTICAL];
}
