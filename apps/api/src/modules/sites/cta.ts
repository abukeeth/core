import type { SiteFacts, StyleFamilyValue } from "./types";

/**
 * CTA copy per style family (§2a tone guides): Luxury stays formal
 * ("Reserve a Table"), Modern is energetic ("Order Now"), Minimal is terse.
 * The underlying action (order vs. reserve vs. just view the menu) is
 * decided purely from structured facts (§3 CTA logic) — never guessed by
 * an LLM — so it's always correct for what the restaurant actually offers.
 */
const CTA_COPY_BY_FAMILY: Record<StyleFamilyValue, { order: string; reserve: string; menu: string }> = {
  LUXURY: { order: "Order Now", reserve: "Reserve a Table", menu: "View Menu" },
  MODERN: { order: "Order Now", reserve: "Book a Table", menu: "View Menu" },
  MINIMAL: { order: "Order", reserve: "Book a Table", menu: "Menu" },
};

export function computeCtaLabel(facts: SiteFacts, family: StyleFamilyValue): string {
  const copy = CTA_COPY_BY_FAMILY[family];
  if (facts.hasOnlineOrdering) return copy.order;
  if (facts.hasReservations) return copy.reserve;
  return copy.menu;
}
