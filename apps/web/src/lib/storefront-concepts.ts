import type { StyleFamily } from "@/lib/api";

/**
 * Presentation-layer only. Turns a generated site's INTERNAL style family into
 * a business-oriented, human-friendly "storefront concept" name + description.
 *
 * Themes / style families are an internal implementation detail: `styleFamily`
 * is used here ONLY to select a name and is NEVER rendered. This module is a
 * pure, deterministic lookup — no AI, no network, no generation stage — so it
 * adds zero API cost and zero latency.
 *
 * Hard rule (enforced by storefront-concepts.test.ts): no name or description
 * may contain theme/template vocabulary — Theme, Template, Variation, Modern,
 * Luxury, Local, Style Family.
 */

export interface StorefrontConcept {
  name: string;
  description: string;
}

type ConceptTrio = Record<StyleFamily, StorefrontConcept>;

/** Fallback names for any business type without a curated trio below. */
const DEFAULT_CONCEPTS: ConceptTrio = {
  LUXURY: { name: "The Signature", description: "A premium storefront that puts your best foot forward." },
  MODERN: { name: "The Showcase", description: "A clean, contemporary storefront built around your business." },
  MINIMAL: { name: "The Corner Shop", description: "A warm, welcoming storefront for everyday visits." },
};

/**
 * Curated concept names per business type. The internal style family is the key;
 * the strongest name is assigned to the family whose engine theme is the natural
 * fit for that business, so the recommended concept reads as the flagship.
 */
const CATALOG: Record<string, ConceptTrio> = {
  VAPE_SHOP: {
    LUXURY: { name: "The Flagship", description: "A bold storefront that puts your products front and center." },
    MODERN: { name: "The Showcase", description: "A clean, editorial storefront that lets your brand shine." },
    MINIMAL: { name: "The Corner Shop", description: "A warm, welcoming storefront for everyday visits." },
  },
  COFFEE_SHOP: {
    MINIMAL: { name: "The Signature Cafe", description: "A calm, inviting storefront built around your craft." },
    MODERN: { name: "The Daily Ritual", description: "A crisp, contemporary storefront for your regulars." },
    LUXURY: { name: "The Neighborhood Favorite", description: "A rich, characterful storefront with a premium feel." },
  },
  DELI: {
    MODERN: { name: "The Counter", description: "A fresh, straightforward storefront that leads with your food." },
    MINIMAL: { name: "The Market Special", description: "A warm storefront built around your daily specials." },
    // NOTE: substituted for "The Local Favorite" so no banned word ("Local") ships. Swap back only if the ban is relaxed.
    LUXURY: { name: "The Neighborhood Deli", description: "A hearty, welcoming storefront with a premium touch." },
  },
  RESTAURANT: {
    LUXURY: { name: "The Signature", description: "A refined storefront that elevates your restaurant." },
    MODERN: { name: "The Table", description: "A clean, contemporary storefront built around your menu." },
    MINIMAL: { name: "The Neighborhood Table", description: "A warm, welcoming storefront for your regulars." },
  },
};

/** Deterministic fallback order when a variation carries no style family. */
const FAMILY_BY_INDEX: StyleFamily[] = ["LUXURY", "MODERN", "MINIMAL"];

/**
 * Resolve the customer-facing concept for one generated variation. `index` is
 * only a fallback for the rare case where `styleFamily` is absent.
 */
export function storefrontConcept(
  businessType: string | null | undefined,
  styleFamily: StyleFamily | null | undefined,
  index = 0,
): StorefrontConcept {
  const trio = CATALOG[(businessType ?? "").toUpperCase()] ?? DEFAULT_CONCEPTS;
  const family = styleFamily ?? FAMILY_BY_INDEX[index % FAMILY_BY_INDEX.length] ?? "MODERN";
  return trio[family] ?? DEFAULT_CONCEPTS[family] ?? DEFAULT_CONCEPTS.MODERN;
}

/** Every curated + default concept — used by the guardrail test only. */
export function listAllConcepts(): StorefrontConcept[] {
  return [...Object.values(CATALOG).flatMap((trio) => Object.values(trio)), ...Object.values(DEFAULT_CONCEPTS)];
}
