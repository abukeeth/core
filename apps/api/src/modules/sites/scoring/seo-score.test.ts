import { describe, expect, it } from "vitest";
import { scoreSeo } from "./seo-score";
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
        title: "Home — Trattoria Bella | Italian in Springfield",
        metaDescription: "Handmade pasta and Italian classics in Springfield, made fresh every day for lunch and dinner.",
        sections: [{ type: "hero", props: {} }, { type: "footer", props: {} }],
      },
    ],
    ...overrides,
  };
}

const noAssets: AssetSummary = { totalPhotoAssets: 0, altTextMissingCount: 0, unprocessedRenditionsCount: 0 };

describe("scoreSeo", () => {
  it("gives a well-formed site a perfect score", () => {
    const result = scoreSeo(definition(), noAssets);
    expect(result.score).toBe(100);
    expect(result.suggestions).toHaveLength(0);
  });

  it("penalizes a title outside the ideal length range", () => {
    const def = definition();
    def.pages[0].title = "Hi";
    const result = scoreSeo(def, noAssets);
    expect(result.score).toBeLessThan(100);
    expect(result.suggestions.some((s) => s.id.includes("title-length"))).toBe(true);
  });

  it("penalizes a page whose title and meta description both omit the cuisine keyword", () => {
    const def = definition();
    def.pages[0].title = "Home — Trattoria Bella";
    def.pages[0].metaDescription = "Come visit us for a wonderful meal in a cozy atmosphere today.";
    const result = scoreSeo(def, noAssets);
    expect(result.suggestions.some((s) => s.id.includes("keyword"))).toBe(true);
  });

  it("flags missing alt text with a missingAltText auto-fix suggestion", () => {
    const result = scoreSeo(definition(), { totalPhotoAssets: 5, altTextMissingCount: 3, unprocessedRenditionsCount: 0 });
    const suggestion = result.suggestions.find((s) => s.autoFixKind === "missingAltText");
    expect(suggestion).toBeDefined();
    expect(result.score).toBeLessThan(100);
  });

  it("never returns a negative score", () => {
    const def = definition();
    def.pages[0].title = "x";
    def.pages[0].metaDescription = "y";
    const result = scoreSeo(def, { totalPhotoAssets: 20, altTextMissingCount: 20, unprocessedRenditionsCount: 0 });
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});
