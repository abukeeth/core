import { beforeEach, describe, expect, it, vi } from "vitest";

const mockComplete = vi.fn();

vi.mock("../../../lib/ai", () => ({
  getAIProvider: () => ({ complete: mockComplete }),
}));

import { scoreBrandConsistency } from "./brand-consistency-score";
import { THEME_CATALOG } from "../theme-catalog";
import type { BrandProfile, SiteDefinition } from "../types";

beforeEach(() => {
  vi.clearAllMocks();
});

const theme = THEME_CATALOG.find((t) => t.key === "modern-bistro")!;

function definition(overrides: Partial<SiteDefinition> = {}): SiteDefinition {
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
    facts: { restaurantName: "Trattoria Bella", hasOnlineOrdering: false, hasReservations: false },
    pages: [
      {
        slug: "/",
        title: "Home — Trattoria Bella | Italian",
        metaDescription: "Handmade pasta, made fresh daily.",
        sections: [{ type: "hero", props: { headline: "Welcome", subhead: "Fresh pasta daily" } }],
      },
    ],
    ...overrides,
  };
}

const brandProfile: BrandProfile = {
  cuisine: "italian",
  businessType: "bistro",
  priceTier: 3,
  personality: { traditionalContemporary: 0.5, casualFormal: 0.5, playfulSerious: 0.5, understatedBold: 0.5, rusticPolished: 0.5 },
  signalsUsed: [],
  confidence: { cuisine: 0.9, businessType: 0.9, priceTier: 0.9, personality: 0.9 },
};

describe("scoreBrandConsistency", () => {
  it("gives a perfect score when typography matches the theme and the LLM judge is fully aligned", async () => {
    mockComplete.mockResolvedValue(JSON.stringify({ alignmentScore: 100 }));

    const result = await scoreBrandConsistency(definition(), brandProfile, theme);

    expect(result.score).toBe(100);
    expect(result.suggestions).toHaveLength(0);
  });

  it("penalizes typography that no longer matches the theme's curated pairing", async () => {
    mockComplete.mockResolvedValue(JSON.stringify({ alignmentScore: 100 }));

    const result = await scoreBrandConsistency(definition({ typography: { display: "Comic Sans", body: "Comic Sans" } }), brandProfile, theme);

    expect(result.suggestions.some((s) => s.id.includes("font-pairing"))).toBe(true);
    expect(result.score).toBeLessThan(100);
  });

  it("penalizes a low LLM alignment score and surfaces its issue", async () => {
    mockComplete.mockResolvedValue(JSON.stringify({ alignmentScore: 40, issue: "Tone reads too casual for a formal brand" }));

    const result = await scoreBrandConsistency(definition(), brandProfile, theme);

    const suggestion = result.suggestions.find((s) => s.id.includes("tone-alignment"));
    expect(suggestion).toBeDefined();
    expect(suggestion?.issue).toBe("Tone reads too casual for a formal brand");
    expect(suggestion?.impact).toBe("high");
  });

  it("falls back to a neutral score when the LLM call fails, without throwing", async () => {
    mockComplete.mockRejectedValue(new Error("network error"));

    const result = await scoreBrandConsistency(definition(), brandProfile, theme);

    expect(result.score).toBeGreaterThan(0);
  });
});
