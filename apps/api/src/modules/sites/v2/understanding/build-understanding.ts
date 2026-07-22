import { resolveVertical } from "../../branding/vertical-profiles";
import type { BrandProfile, IngestData } from "../../types";
import { businessUnderstandingSchema, type BusinessUnderstanding, type Evidence } from "../contracts";

/**
 * Generation V2 — Business Understanding (P1).
 *
 * Deterministic, LLM-free analysis of the REAL business data: every inference
 * is computed from the menu/prices/name/description and carries an evidence
 * entry saying which source supports it. This object — not any style system —
 * is what the creative briefs think from.
 */

const CRAFT_WORDS = /\b(hand[- ]?made|house[- ]?made|hand[- ]?carved|hand[- ]?rolled|stone[- ]?baked|wood[- ]?fired|slow[- ]?cooked|small[- ]?batch|ferment\w*|laminated|layers|cured|aged|daily|fresh[- ]?baked|roasted (in[- ]?house|daily))\b/i;

const CONSUMABLE_CATEGORY = /\b(refill|pods?|coils?|e[- ]?liquids?|cartridges?|accessor|disposables?|supplies)\b/i;

const DESSERT_CATEGORY = /\b(desserts?|sweets?|dolci|pastries|cakes?|gelato|ice[- ]?cream)\b/i;

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

function priceTier(prices: number[]): { tier: BusinessUnderstanding["identity"]["priceTier"]; evidence: Evidence } {
  const sorted = [...prices].sort((a, b) => a - b);
  const med = median(sorted);
  const p10 = sorted[Math.floor(sorted.length * 0.1)] ?? med;
  const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))] ?? med;
  const spread = p10 > 0 ? p90 / p10 : 1;
  const asMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  if (sorted.length > 3 && spread >= 4) {
    return {
      tier: "mixed",
      evidence: { claim: `Price spread ${asMoney(p10)}–${asMoney(p90)} (${spread.toFixed(1)}×) → two businesses in one (daily + occasion)`, source: "PRICES", confidence: 0.85 },
    };
  }
  const tier = med < 650 ? "budget" : med < 1000 ? "casual" : med < 1600 ? "premium-casual" : "premium";
  return { tier, evidence: { claim: `Median item price ${asMoney(med)} → ${tier} tier`, source: "PRICES", confidence: 0.8 } };
}

/** One representative per category by menu order, then price leaders — real names only. */
function flagships(ingest: IngestData): string[] {
  const seen = new Set<string>();
  const byCategory: string[] = [];
  for (const item of ingest.menu) {
    if (seen.has(item.categoryName)) continue;
    seen.add(item.categoryName);
    byCategory.push(item.name);
  }
  const priceLeaders = [...ingest.menu].sort((a, b) => b.priceCents - a.priceCents).map((i) => i.name);
  return [...new Set([...byCategory, ...priceLeaders])].slice(0, 8);
}

export interface BuildUnderstandingInput {
  ingest: IngestData;
  services?: { pickup: boolean; delivery: boolean; dineIn: boolean; reservations: boolean };
  sourceType?: BusinessUnderstanding["sourceSignals"]["sourceType"];
}

export function buildBusinessUnderstanding(input: BuildUnderstandingInput): BusinessUnderstanding {
  const { ingest } = input;
  const evidence: Evidence[] = [];
  const categories = [...new Set(ingest.menu.map((m) => m.categoryName))];

  // --- vertical, with the evidence that resolved it -------------------------
  const resolvedVertical = resolveVertical(ingest.businessType, { businessType: ingest.businessType ?? "" } as unknown as BrandProfile, {
    businessName: ingest.restaurantName,
    menuCategories: categories,
  });
  const verticalOverridden = Boolean(ingest.businessType) && resolvedVertical !== ingest.businessType;
  evidence.push({
    claim: verticalOverridden
      ? `Stored type "${ingest.businessType}" overridden to ${resolvedVertical} by name/menu evidence`
      : `Vertical ${resolvedVertical} (stored type + name/menu agree)`,
    source: verticalOverridden ? "MENU" : "NAME",
    confidence: verticalOverridden ? 0.9 : 0.7,
  });

  // --- prices ---------------------------------------------------------------
  const prices = ingest.menu.map((m) => m.priceCents).filter((p) => p > 0);
  const { tier, evidence: priceEvidence } = priceTier(prices.length > 0 ? prices : [0]);
  if (prices.length > 0) evidence.push(priceEvidence);

  // --- signals (each only when actually present) ----------------------------
  const craftItems = ingest.menu.filter((m) => CRAFT_WORDS.test(m.description ?? "") || CRAFT_WORDS.test(m.name));
  if (craftItems.length >= 2) {
    evidence.push({
      claim: `Process-proud language in ${craftItems.length} item descriptions (e.g. "${craftItems[0].name}") → craft is part of the brand`,
      source: "DESCRIPTION",
      confidence: 0.85,
    });
  }
  const dessertCategories = categories.filter((c) => DESSERT_CATEGORY.test(c));
  if (dessertCategories.length > 0 && resolvedVertical !== "BAKERY") {
    evidence.push({
      claim: `Dessert daypart present (${dessertCategories.join(", ")}) → an evening/treat occasion exists beyond the core meal`,
      source: "MENU",
      confidence: 0.7,
    });
  }
  const consumableCategories = categories.filter((c) => CONSUMABLE_CATEGORY.test(c));
  if (consumableCategories.length >= 2) {
    evidence.push({
      claim: `Consumables dominate (${consumableCategories.join(", ")}) → revenue is repeat purchases; reorder speed beats discovery`,
      source: "MENU",
      confidence: 0.85,
    });
  }
  const sortedPrices = [...prices].sort((a, b) => a - b);
  const med = median(sortedPrices);
  const max = sortedPrices[sortedPrices.length - 1] ?? 0;
  if (med > 0 && max / med >= 3) {
    const top = ingest.menu.find((m) => m.priceCents === max)!;
    evidence.push({
      claim: `"${top.name}" at $${(max / 100).toFixed(2)} is ${(max / med).toFixed(1)}× the median → an occasions/celebration line worth leading with`,
      source: "PRICES",
      confidence: 0.8,
    });
  }

  const description = ingest.description?.trim();
  const positioning = description && description.length > 0 ? description : `${resolvedVertical.toLowerCase().replace(/_/g, " ")}, ${tier} tier`;
  if (description) evidence.push({ claim: `Positioning taken from the owner's own description`, source: "DESCRIPTION", confidence: 0.9 });

  const perCategory = categories.map((name) => {
    const items = ingest.menu.filter((m) => m.categoryName === name);
    const catPrices = items.map((i) => i.priceCents);
    return {
      name,
      itemCount: items.length,
      priceRangeCents: [Math.min(...catPrices), Math.max(...catPrices)] as [number, number],
      representativeItems: items.slice(0, 6).map((i) => i.name),
    };
  });

  return businessUnderstandingSchema.parse({
    schemaVersion: 1,
    identity: { name: ingest.restaurantName, resolvedVertical, positioning, priceTier: tier },
    catalog: {
      categories: perCategory,
      flagshipProducts: flagships(ingest),
      menuBreadth: { categoryCount: categories.length, itemCount: ingest.menu.length },
      hasPhotos: ingest.photoCount > 0,
    },
    services: input.services ?? { pickup: true, delivery: false, dineIn: false, reservations: false },
    sourceSignals: { sourceType: input.sourceType ?? "unknown", description, locale: "en" },
    evidence,
  });
}
