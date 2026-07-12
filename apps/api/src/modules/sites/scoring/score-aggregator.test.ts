import { beforeEach, describe, expect, it, vi } from "vitest";

const mockComplete = vi.fn();

vi.mock("../../../lib/ai", () => ({
  getAIProvider: () => ({ complete: mockComplete }),
}));

import { scoreSiteDefinition } from "./score-aggregator";
import { THEME_CATALOG } from "../theme-catalog";
import type { AssetSummary, BrandProfile, SiteDefinition } from "../types";

beforeEach(() => {
  vi.clearAllMocks();
  mockComplete.mockResolvedValue(JSON.stringify({ alignmentScore: 100 }));
});

const theme = THEME_CATALOG.find((t) => t.key === "modern-bistro")!;

const brandProfile: BrandProfile = {
  cuisine: "italian",
  businessType: "bistro",
  priceTier: 3,
  personality: { traditionalContemporary: 0.5, casualFormal: 0.5, playfulSerious: 0.5, understatedBold: 0.5, rusticPolished: 0.5 },
  signalsUsed: [],
  confidence: { cuisine: 0.9, businessType: 0.9, priceTier: 0.9, personality: 0.9 },
};

function goodDefinition(): SiteDefinition {
  return {
    schemaVersion: 1,
    restaurantName: "Trattoria Bella",
    tagline: "Handmade pasta, done right",
    cuisine: "italian",
    businessType: "bistro",
    styleFamily: "MODERN",
    themeKey: theme.key,
    themeVersion: theme.version,
    colorSeed: theme.tokens.colorSeed,
    typography: theme.tokens.typography,
    facts: { restaurantName: "Trattoria Bella", address: "123 Main St, Springfield, IL", phone: "555-0100", hasOnlineOrdering: true, hasReservations: false },
    pages: [
      {
        slug: "/",
        title: "Home — Trattoria Bella | Italian in Springfield",
        metaDescription: "Handmade pasta and Italian classics in Springfield, made fresh every day for lunch and dinner.",
        sections: [
          { type: "hero", props: { headline: "Welcome", subhead: "Fresh pasta daily", ctaLabel: "Order Now" } },
          { type: "hoursLocation", props: { address: "123 Main St", phone: "555-0100" } },
          { type: "footer", props: {} },
        ],
      },
      {
        slug: "/contact",
        title: "Contact — Trattoria Bella | Italian in Springfield",
        metaDescription: "Get in touch with Trattoria Bella in Springfield for reservations and questions.",
        sections: [{ type: "contactInfo", props: { address: "123 Main St", phone: "555-0100" } }, { type: "footer", props: {} }],
      },
    ],
  };
}

function knownDefectDefinition(): SiteDefinition {
  const def = goodDefinition();
  def.pages[0].title = "Home";
  def.pages[0].metaDescription = "x";
  def.pages[0].sections[0] = { type: "hero", props: {} }; // no CTA
  return def;
}

const noAssets: AssetSummary = { totalPhotoAssets: 0, altTextMissingCount: 0, unprocessedRenditionsCount: 0 };

describe("scoreSiteDefinition", () => {
  it("gives a well-formed site a high overall score across all dimensions", async () => {
    const result = await scoreSiteDefinition(goodDefinition(), { brandProfile, theme, assets: noAssets });

    expect(result.overall).toBeGreaterThanOrEqual(90);
    expect(result.seo).toBeGreaterThan(0);
    expect(result.performance).toBeGreaterThan(0);
    expect(result.accessibility).toBeGreaterThan(0);
    expect(result.brandConsistency).toBeGreaterThan(0);
    expect(result.conversion).toBeGreaterThan(0);
  });

  it("penalizes known defects with matching suggestions (fixture with missing CTA + bad SEO fields)", async () => {
    const good = await scoreSiteDefinition(goodDefinition(), { brandProfile, theme, assets: noAssets });
    const result = await scoreSiteDefinition(knownDefectDefinition(), { brandProfile, theme, assets: noAssets });

    expect(result.overall).toBeLessThan(good.overall);
    expect(result.suggestions.some((s) => s.dimension === "seo")).toBe(true);
    expect(result.suggestions.some((s) => s.dimension === "conversion" && s.id.includes("cta-above-fold"))).toBe(true);
  });

  it("ranks suggestions by impact (high before medium before low)", async () => {
    const result = await scoreSiteDefinition(knownDefectDefinition(), { brandProfile, theme, assets: noAssets });

    const impacts = result.suggestions.map((s) => s.impact);
    const rank = { high: 0, medium: 1, low: 2 } as const;
    for (let i = 1; i < impacts.length; i++) {
      expect(rank[impacts[i]]).toBeGreaterThanOrEqual(rank[impacts[i - 1]]);
    }
  });

  it("is deterministic for the rule-based dimensions given the same inputs and a stable LLM judge", async () => {
    const first = await scoreSiteDefinition(goodDefinition(), { brandProfile, theme, assets: noAssets });
    const second = await scoreSiteDefinition(goodDefinition(), { brandProfile, theme, assets: noAssets });

    expect(first.seo).toBe(second.seo);
    expect(first.performance).toBe(second.performance);
    expect(first.accessibility).toBe(second.accessibility);
    expect(first.conversion).toBe(second.conversion);
  });
});
