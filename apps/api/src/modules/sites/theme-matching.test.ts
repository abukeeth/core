import { describe, expect, it } from "vitest";
import { THEME_CATALOG } from "./theme-catalog";
import { cosineSimilarity, derivePaletteSeed, personalitySimilarity, selectThemeForFamily, selectThemesForAllFamilies } from "./theme-matching";
import type { BrandProfile, StyleFamilyValue, ThemeCatalogEntry } from "./types";

const UPSCALE_SUSHI: BrandProfile = {
  cuisine: "japanese",
  businessType: "fine dining",
  priceTier: 4,
  personality: {
    traditionalContemporary: 0.4,
    casualFormal: 0.9,
    playfulSerious: 0.85,
    understatedBold: 0.4,
    rusticPolished: 0.9,
  },
  signalsUsed: ["menu language", "price points"],
  confidence: { cuisine: 0.9, businessType: 0.9, priceTier: 0.9, personality: 0.85 },
};

const CASUAL_TAQUERIA: BrandProfile = {
  cuisine: "mexican",
  businessType: "food truck",
  priceTier: 1,
  personality: {
    traditionalContemporary: 0.7,
    casualFormal: 0.1,
    playfulSerious: 0.15,
    understatedBold: 0.8,
    rusticPolished: 0.25,
  },
  signalsUsed: ["menu language", "photo style"],
  confidence: { cuisine: 0.9, businessType: 0.8, priceTier: 0.9, personality: 0.8 },
};

const FRENCH_PATISSERIE: BrandProfile = {
  cuisine: "french",
  businessType: "bakery",
  priceTier: 3,
  personality: {
    traditionalContemporary: 0.3,
    casualFormal: 0.6,
    playfulSerious: 0.6,
    understatedBold: 0.3,
    rusticPolished: 0.7,
  },
  signalsUsed: ["menu language", "existing logo colors"],
  confidence: { cuisine: 0.85, businessType: 0.85, priceTier: 0.8, personality: 0.75 },
};

describe("cosineSimilarity / personalitySimilarity", () => {
  it("gives identical vectors a similarity of 1", () => {
    expect(cosineSimilarity([1, 0, 1], [1, 0, 1])).toBeCloseTo(1);
  });

  it("gives orthogonal vectors a similarity of 0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("scores identical personalities as maximally similar", () => {
    expect(personalitySimilarity(UPSCALE_SUSHI.personality, UPSCALE_SUSHI.personality)).toBeCloseTo(1);
  });

  it("scores opposite-end personalities as dissimilar", () => {
    const similarity = personalitySimilarity(UPSCALE_SUSHI.personality, CASUAL_TAQUERIA.personality);
    expect(similarity).toBeLessThan(0.5);
  });
});

describe("selectThemesForAllFamilies (golden tests, deterministic)", () => {
  // These profiles are restaurants, so they pass businessType RESTAURANT — the
  // realistic call (every tenant has a type). Type-scoped vertical themes
  // (cafe/deli/vape) are hard-excluded for a restaurant and never interfere.
  it("picks restaurant-maison (the polished fine-dining Luxury design system) for an upscale sushi restaurant's Luxury variation", () => {
    const result = selectThemesForAllFamilies(THEME_CATALOG, UPSCALE_SUSHI, 3, "RESTAURANT");
    // V3 — a formal, polished, understated fine-dining brand fits Maison
    // better than the bold bold-commerce system.
    expect(result.LUXURY.theme.key).toBe("restaurant-maison");
    expect(result.LUXURY.reasons.length).toBeGreaterThan(0);
  });

  it("picks modern-editorial (the type-agnostic Modern design system) for a casual taqueria's Modern variation", () => {
    const result = selectThemesForAllFamilies(THEME_CATALOG, CASUAL_TAQUERIA, 3, "RESTAURANT");
    expect(result.MODERN.theme.key).toBe("modern-editorial");
  });

  it("picks restaurant-maison for a French patisserie's Luxury variation", () => {
    const result = selectThemesForAllFamilies(THEME_CATALOG, FRENCH_PATISSERIE, 3, "RESTAURANT");
    expect(result.LUXURY.theme.key).toBe("restaurant-maison");
  });

  it("always returns exactly one theme per style family", () => {
    for (const profile of [UPSCALE_SUSHI, CASUAL_TAQUERIA, FRENCH_PATISSERIE]) {
      const result = selectThemesForAllFamilies(THEME_CATALOG, profile, 3);
      expect(Object.keys(result).sort()).toEqual(["LUXURY", "MINIMAL", "MODERN"]);
    }
  });

  it("is deterministic — same inputs always produce the same theme picks", () => {
    const first = selectThemesForAllFamilies(THEME_CATALOG, UPSCALE_SUSHI, 3);
    const second = selectThemesForAllFamilies(THEME_CATALOG, UPSCALE_SUSHI, 3);
    expect(first.LUXURY.theme.key).toBe(second.LUXURY.theme.key);
    expect(first.MODERN.theme.key).toBe(second.MODERN.theme.key);
    expect(first.MINIMAL.theme.key).toBe(second.MINIMAL.theme.key);
    expect(first.LUXURY.score).toBe(second.LUXURY.score);
  });

  it("still picks a theme in every family when there are zero photos, via the fallback path", () => {
    const result = selectThemesForAllFamilies(THEME_CATALOG, UPSCALE_SUSHI, 0, "RESTAURANT");
    // For a restaurant, LUXURY candidates are bold-commerce (needs 1 photo) and
    // restaurant-maison (needs 2); the VAPE-scoped vape-lab is excluded. Both
    // eligible themes are photo-excluded at zero photos, so the fallback returns
    // the least photo-dependent one, bold-commerce (with a polished non-photo
    // tile at render time — see image-fallback.ts), rather than leaving the
    // family empty.
    expect(result.LUXURY.theme.key).toBe("bold-commerce");
    expect(result.LUXURY.reasons[0]).toMatch(/fallback/i);
    // Minimal themes have no photo constraint, so it's a real (non-fallback) pick.
    expect(result.MINIMAL.reasons[0]).not.toMatch(/fallback/i);
  });

  it("never selects a deprecated legacy theme for a fresh generation", () => {
    const deprecatedKeys = new Set(THEME_CATALOG.filter((t) => t.deprecated).map((t) => t.key));
    for (const profile of [UPSCALE_SUSHI, CASUAL_TAQUERIA, FRENCH_PATISSERIE]) {
      const result = selectThemesForAllFamilies(THEME_CATALOG, profile, 3);
      expect(deprecatedKeys.has(result.LUXURY.theme.key)).toBe(false);
      expect(deprecatedKeys.has(result.MODERN.theme.key)).toBe(false);
      expect(deprecatedKeys.has(result.MINIMAL.theme.key)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Theme Engine V3 — Milestone 1: business-type-aware selection
// ---------------------------------------------------------------------------

/** A minimal well-formed catalog entry for synthetic-catalog selection tests. */
function fakeTheme(key: string, styleFamily: StyleFamilyValue, over: Partial<ThemeCatalogEntry> = {}): ThemeCatalogEntry {
  return {
    key,
    version: 1,
    styleFamily,
    personalityVector: { traditionalContemporary: 0.5, casualFormal: 0.5, playfulSerious: 0.5, understatedBold: 0.5, rusticPolished: 0.5 },
    cuisineAffinities: {},
    constraints: {},
    tokens: { colorSeed: "#333333", typography: { display: "A", body: "B" }, radius: "soft", motion: "none", typeScaleRatio: 1.2 },
    variants: { hero: ["minimal-typographic"], menuLayout: ["classic-list"], chrome: ["standard"] },
    layouts: { home: ["hero", "footer"] },
    ...over,
  };
}

describe("business-type-aware selection (V3 Milestone 1)", () => {
  it("a RESTAURANT tenant selects restaurant-maison for its LUXURY variation, even when personality alone wouldn't pick it", () => {
    // CASUAL_TAQUERIA is bold/casual — on personality it would prefer bold-commerce.
    const result = selectThemesForAllFamilies(THEME_CATALOG, CASUAL_TAQUERIA, 3, "RESTAURANT");
    expect(result.LUXURY.theme.key).toBe("restaurant-maison");
    expect(result.LUXURY.reasons[0]).toMatch(/purpose-built for restaurant/i);
  });

  it("a VAPE_SHOP tenant selects the purpose-built vape-lab for LUXURY and never a Restaurant theme", () => {
    const result = selectThemesForAllFamilies(THEME_CATALOG, UPSCALE_SUSHI, 3, "VAPE_SHOP");
    // vape-lab is VAPE-scoped and wins its family by the business-type boost,
    // even against a formal/polished profile that personality alone would send
    // elsewhere.
    expect(result.LUXURY.theme.key).toBe("vape-lab");
    // restaurant-maison is scoped to RESTAURANT and must not appear in any family.
    expect([result.LUXURY.theme.key, result.MODERN.theme.key, result.MINIMAL.theme.key]).not.toContain("restaurant-maison");
  });

  it("resolves the Sprint-5 vertical themes for their business types (and only for them)", () => {
    const cafe = selectThemesForAllFamilies(THEME_CATALOG, UPSCALE_SUSHI, 3, "COFFEE_SHOP");
    expect(cafe.MINIMAL.theme.key).toBe("cafe-daybreak");

    const deli = selectThemesForAllFamilies(THEME_CATALOG, UPSCALE_SUSHI, 3, "DELI");
    expect(deli.MODERN.theme.key).toBe("deli-brooklyn");

    const vape = selectThemesForAllFamilies(THEME_CATALOG, UPSCALE_SUSHI, 3, "VAPE_SHOP");
    expect(vape.LUXURY.theme.key).toBe("vape-lab");

    // A restaurant never receives any of the three vertical themes.
    const restaurant = selectThemesForAllFamilies(THEME_CATALOG, UPSCALE_SUSHI, 3, "RESTAURANT");
    const picked = [restaurant.LUXURY.theme.key, restaurant.MODERN.theme.key, restaurant.MINIMAL.theme.key];
    expect(picked).not.toContain("cafe-daybreak");
    expect(picked).not.toContain("deli-brooklyn");
    expect(picked).not.toContain("vape-lab");
  });

  it("resolves a type-specific theme once one is added (e.g. a BAKERY theme wins for a bakery, and only for a bakery)", () => {
    const catalog: ThemeCatalogEntry[] = [
      fakeTheme("generic-minimal", "MINIMAL"), // type-agnostic
      fakeTheme("bakery-warmth", "MINIMAL", { businessTypes: ["BAKERY"] }), // type-scoped
    ];
    const bakery = selectThemeForFamily("MINIMAL", catalog, FRENCH_PATISSERIE, 3, "BAKERY");
    expect(bakery.theme.key).toBe("bakery-warmth");
    // A different business type never gets the bakery theme; the agnostic one wins.
    const deli = selectThemeForFamily("MINIMAL", catalog, FRENCH_PATISSERIE, 3, "DELI");
    expect(deli.theme.key).toBe("generic-minimal");
  });

  it("the same mechanism resolves Cafe, Convenience and Retail themes once registered", () => {
    const catalog: ThemeCatalogEntry[] = [
      fakeTheme("generic-modern", "MODERN"),
      fakeTheme("cafe-daybreak", "MODERN", { businessTypes: ["COFFEE_SHOP"] }),
      fakeTheme("convenience-quickmart", "MODERN", { businessTypes: ["CONVENIENCE_STORE"] }),
      fakeTheme("retail-storefront", "MODERN", { businessTypes: ["RETAIL"] }),
    ];
    expect(selectThemeForFamily("MODERN", catalog, CASUAL_TAQUERIA, 3, "COFFEE_SHOP").theme.key).toBe("cafe-daybreak");
    expect(selectThemeForFamily("MODERN", catalog, CASUAL_TAQUERIA, 3, "CONVENIENCE_STORE").theme.key).toBe("convenience-quickmart");
    expect(selectThemeForFamily("MODERN", catalog, CASUAL_TAQUERIA, 3, "RETAIL").theme.key).toBe("retail-storefront");
    // A business type with no dedicated theme falls back to the agnostic one.
    expect(selectThemeForFamily("MODERN", catalog, CASUAL_TAQUERIA, 3, "DELI").theme.key).toBe("generic-modern");
  });

  it("type-agnostic entries (no businessTypes[]) stay eligible for every business type", () => {
    // modern-editorial / warm-local have no businessTypes — a Vape Shop still gets them.
    const result = selectThemesForAllFamilies(THEME_CATALOG, UPSCALE_SUSHI, 3, "VAPE_SHOP");
    expect(result.MODERN.theme.key).toBe("modern-editorial");
    expect(result.MINIMAL.theme.key).toBe("warm-local");
  });

  it("is backward compatible: a restaurant's picks are unaffected by the Sprint-5 vertical themes", () => {
    // The vertical themes are type-scoped, so a restaurant keeps the pre-Sprint-5
    // picks (maison / modern-editorial / warm-local) and never sees them.
    const result = selectThemesForAllFamilies(THEME_CATALOG, UPSCALE_SUSHI, 3, "RESTAURANT");
    expect(result.LUXURY.theme.key).toBe("restaurant-maison");
    expect(result.MODERN.theme.key).toBe("modern-editorial");
    expect(result.MINIMAL.theme.key).toBe("warm-local");
  });

  it("a Vape Shop with zero photos still gets its purpose-built theme (no photo requirement), never the photo-hungry restaurant theme", () => {
    const result = selectThemesForAllFamilies(THEME_CATALOG, UPSCALE_SUSHI, 0, "VAPE_SHOP");
    // vape-lab has no photo constraint, so this is a real pick, not a fallback.
    expect(result.LUXURY.theme.key).toBe("vape-lab");
    expect(result.LUXURY.reasons[0]).toMatch(/purpose-built for vape/i);
  });
});

describe("derivePaletteSeed", () => {
  it("prefers an existing logo color over any other source", () => {
    expect(derivePaletteSeed(UPSCALE_SUSHI, "#123456", "#abcdef")).toBe("#123456");
  });

  it("falls back to a cuisine hint when there's no logo", () => {
    const seed = derivePaletteSeed(UPSCALE_SUSHI, undefined, "#abcdef");
    expect(seed).toBe("#1f2937"); // japanese hint
  });

  it("falls back to the theme's default seed for an unrecognized cuisine", () => {
    const profile: BrandProfile = { ...UPSCALE_SUSHI, cuisine: "fusion-experimental" };
    expect(derivePaletteSeed(profile, undefined, "#abcdef")).toBe("#abcdef");
  });
});
