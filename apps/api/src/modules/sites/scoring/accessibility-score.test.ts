import { describe, expect, it } from "vitest";
import { scoreAccessibility } from "./accessibility-score";
import type { AssetSummary, SiteDefinition } from "../types";

function definition(overrides: Partial<SiteDefinition> = {}): SiteDefinition {
  return {
    schemaVersion: 1,
    restaurantName: "Trattoria Bella",
    tagline: "Handmade pasta, done right",
    cuisine: "italian",
    businessType: "bistro",
    styleFamily: "MODERN",
    themeKey: "modern-bistro",
    themeVersion: 1,
    colorSeed: "#e8590c",
    typography: { display: "Sora", body: "Inter" },
    facts: { restaurantName: "Trattoria Bella", hasOnlineOrdering: false, hasReservations: false },
    pages: [
      {
        slug: "/",
        title: "Home — Trattoria Bella | Italian",
        metaDescription: "Handmade pasta and Italian classics, made fresh every day.",
        sections: [{ type: "hero", props: {} }, { type: "footer", props: {} }],
      },
    ],
    ...overrides,
  };
}

const noAssets: AssetSummary = { totalPhotoAssets: 0, altTextMissingCount: 0, unprocessedRenditionsCount: 0 };

describe("scoreAccessibility", () => {
  it("gives a site with no hero-luminance data and no missing alt text a perfect score", () => {
    const result = scoreAccessibility(definition(), noAssets);
    expect(result.score).toBe(100);
  });

  it("flags a hero with a bright image and no scrim", () => {
    const def = definition();
    def.pages[0].sections[0] = { type: "hero", props: { heroImageLuminance: 0.9, scrimOpacity: 0 } };
    const result = scoreAccessibility(def, noAssets);
    const suggestion = result.suggestions.find((s) => s.autoFixKind === "heroContrast");
    expect(suggestion).toBeDefined();
    expect(result.score).toBeLessThan(100);
  });

  it("doesn't flag a hero with a bright image once a sufficient scrim is applied", () => {
    const def = definition();
    def.pages[0].sections[0] = { type: "hero", props: { heroImageLuminance: 0.9, scrimOpacity: 0.5 } };
    const result = scoreAccessibility(def, noAssets);
    expect(result.suggestions.find((s) => s.autoFixKind === "heroContrast")).toBeUndefined();
  });

  it("flags missing alt text", () => {
    const result = scoreAccessibility(definition(), { totalPhotoAssets: 4, altTextMissingCount: 2, unprocessedRenditionsCount: 0 });
    expect(result.suggestions.some((s) => s.autoFixKind === "missingAltText")).toBe(true);
  });

  it("never returns a negative score", () => {
    const def = definition({ colorSeed: "#808080" });
    def.pages[0].sections[0] = { type: "hero", props: { heroImageLuminance: 0.95, scrimOpacity: 0 } };
    const result = scoreAccessibility(def, { totalPhotoAssets: 10, altTextMissingCount: 10, unprocessedRenditionsCount: 0 });
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});
