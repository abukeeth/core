import { describe, expect, it } from "vitest";
import { THEME_CATALOG } from "./theme-catalog";
import { cosineSimilarity, derivePaletteSeed, personalitySimilarity, selectThemesForAllFamilies } from "./theme-matching";
import type { BrandProfile } from "./types";

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
  it("picks fine-dining for an upscale sushi restaurant's Luxury variation", () => {
    const result = selectThemesForAllFamilies(THEME_CATALOG, UPSCALE_SUSHI, 3);
    expect(result.LUXURY.theme.key).toBe("fine-dining");
    expect(result.LUXURY.reasons.length).toBeGreaterThan(0);
  });

  it("picks street-food for a casual taqueria's Modern variation", () => {
    const result = selectThemesForAllFamilies(THEME_CATALOG, CASUAL_TAQUERIA, 3);
    expect(result.MODERN.theme.key).toBe("street-food");
  });

  it("picks fine-dining for a French patisserie's Luxury variation", () => {
    const result = selectThemesForAllFamilies(THEME_CATALOG, FRENCH_PATISSERIE, 3);
    expect(result.LUXURY.theme.key).toBe("fine-dining");
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
    const result = selectThemesForAllFamilies(THEME_CATALOG, UPSCALE_SUSHI, 0);
    // Luxury themes all require photos; the fallback still returns the
    // least photo-dependent one rather than leaving the family empty.
    expect(result.LUXURY.theme.key).toBe("elegant-dark");
    expect(result.LUXURY.reasons[0]).toMatch(/fallback/i);
    // Minimal themes have no photo constraint, so it's a real (non-fallback) pick.
    expect(result.MINIMAL.reasons[0]).not.toMatch(/fallback/i);
  });

  it("excludes a photo-dependent theme once photoCount drops below its minimum", () => {
    // coastal (MODERN) requires minPhotos: 2; with exactly 1 photo it must
    // never be selected over a theme with a lower/no requirement.
    const withOnePhoto = selectThemesForAllFamilies(THEME_CATALOG, FRENCH_PATISSERIE, 1);
    expect(withOnePhoto.MODERN.theme.key).not.toBe("coastal");
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
