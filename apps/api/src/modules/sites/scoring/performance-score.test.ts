import { describe, expect, it } from "vitest";
import { scorePerformance } from "./performance-score";
import type { AssetSummary, SiteDefinition } from "../types";

function definition(sectionCount = 2): SiteDefinition {
  const sections = Array.from({ length: sectionCount }, (_, i) => ({ type: "footer" as const, props: { i } }));
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
    pages: [{ slug: "/", title: "Home — Trattoria Bella | Italian", metaDescription: "Handmade pasta, made fresh daily.", sections }],
  };
}

describe("scorePerformance", () => {
  it("gives a lean site with fully processed images a perfect score", () => {
    const result = scorePerformance(definition(), { totalPhotoAssets: 5, altTextMissingCount: 0, unprocessedRenditionsCount: 0 });
    expect(result.score).toBe(100);
  });

  it("penalizes unprocessed image renditions", () => {
    const assets: AssetSummary = { totalPhotoAssets: 5, altTextMissingCount: 0, unprocessedRenditionsCount: 3 };
    const result = scorePerformance(definition(), assets);
    expect(result.score).toBeLessThan(100);
    expect(result.suggestions.some((s) => s.id.includes("unprocessed-images"))).toBe(true);
  });

  it("penalizes an excessive total section count", () => {
    const result = scorePerformance(definition(40), { totalPhotoAssets: 0, altTextMissingCount: 0, unprocessedRenditionsCount: 0 });
    expect(result.suggestions.some((s) => s.id.includes("section-count"))).toBe(true);
  });

  it("never returns a negative score", () => {
    const result = scorePerformance(definition(40), { totalPhotoAssets: 20, altTextMissingCount: 0, unprocessedRenditionsCount: 20 });
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});
