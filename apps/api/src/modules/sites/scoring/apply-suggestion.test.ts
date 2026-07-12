import { describe, expect, it } from "vitest";
import { scoreAccessibility } from "./accessibility-score";
import { scoreSeo } from "./seo-score";
import { applyDefinitionSuggestionFix, fixHeroContrast, fixMissingMetaDescription } from "./apply-suggestion";
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
    facts: { restaurantName: "Trattoria Bella", address: "123 Main St, Springfield, IL", hasOnlineOrdering: false, hasReservations: false },
    pages: [
      {
        slug: "/",
        title: "Home — Trattoria Bella | Italian in Springfield",
        metaDescription: "",
        sections: [{ type: "hero", props: { heroImageLuminance: 0.9, scrimOpacity: 0 } }, { type: "footer", props: {} }],
      },
    ],
    ...overrides,
  };
}

const noAssets: AssetSummary = { totalPhotoAssets: 0, altTextMissingCount: 0, unprocessedRenditionsCount: 0 };

describe("fixHeroContrast", () => {
  it("resolves the triggering accessibility check", () => {
    const before = scoreAccessibility(definition(), noAssets);
    expect(before.suggestions.some((s) => s.autoFixKind === "heroContrast")).toBe(true);

    const fixed = fixHeroContrast(definition());
    const after = scoreAccessibility(fixed, noAssets);

    expect(after.suggestions.some((s) => s.autoFixKind === "heroContrast")).toBe(false);
    expect(after.score).toBeGreaterThan(before.score);
  });

  it("assumes a conservative default luminance when none was measured", () => {
    const def = definition();
    def.pages[0].sections[0] = { type: "hero", props: {} };
    const fixed = fixHeroContrast(def);
    const heroProps = fixed.pages[0].sections[0].props as { scrimOpacity: number };
    expect(heroProps.scrimOpacity).toBeGreaterThan(0);
  });

  it("leaves non-hero sections untouched", () => {
    const fixed = fixHeroContrast(definition());
    expect(fixed.pages[0].sections[1]).toEqual({ type: "footer", props: {} });
  });
});

describe("fixMissingMetaDescription", () => {
  it("resolves the triggering SEO check by filling an empty meta description", () => {
    const before = scoreSeo(definition(), noAssets);
    expect(before.suggestions.some((s) => s.id.includes("meta-length"))).toBe(true);

    const fixed = fixMissingMetaDescription(definition());
    expect(fixed.pages[0].metaDescription.length).toBeGreaterThan(0);

    const after = scoreSeo(fixed, noAssets);
    expect(after.suggestions.some((s) => s.id.includes("meta-length"))).toBe(false);
  });

  it("doesn't touch a page whose meta description is already present", () => {
    const def = definition({
      pages: [
        {
          slug: "/",
          title: "Home",
          metaDescription: "Already a fine, existing meta description for the home page here.",
          sections: [{ type: "footer", props: {} }],
        },
      ],
    });
    const fixed = fixMissingMetaDescription(def);
    expect(fixed.pages[0].metaDescription).toBe(def.pages[0].metaDescription);
  });
});

describe("applyDefinitionSuggestionFix", () => {
  it("dispatches heroContrast to fixHeroContrast", () => {
    const fixed = applyDefinitionSuggestionFix(definition(), {
      id: "x",
      dimension: "accessibility",
      issue: "x",
      impact: "high",
      suggestion: "x",
      autoFixKind: "heroContrast",
    });
    const heroProps = fixed.pages[0].sections[0].props as { scrimOpacity: number };
    expect(heroProps.scrimOpacity).toBeGreaterThan(0);
  });

  it("returns the definition unchanged for a suggestion with no autoFixKind (missingAltText lives outside the definition)", () => {
    const def = definition();
    const result = applyDefinitionSuggestionFix(def, {
      id: "x",
      dimension: "seo",
      issue: "x",
      impact: "medium",
      suggestion: "x",
      autoFixKind: "missingAltText",
    });
    expect(result).toEqual(def);
  });
});
