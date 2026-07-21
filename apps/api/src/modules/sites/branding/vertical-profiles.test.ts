import { describe, expect, it } from "vitest";
import type { BrandProfile } from "../types";
import { validatePalette } from "./palette-validator";
import { VERTICAL_PROFILES, getVerticalProfile, resolveVertical } from "./vertical-profiles";

function brandProfile(businessType: string): BrandProfile {
  return {
    cuisine: "",
    businessType,
    priceTier: 2,
    personality: { traditionalContemporary: 0.5, casualFormal: 0.5, playfulSerious: 0.5, understatedBold: 0.5, rusticPolished: 0.5 },
    signalsUsed: [],
    confidence: { cuisine: 0.5, businessType: 0.5, priceTier: 0.5, personality: 0.5 },
  };
}

describe("vertical profiles", () => {
  it("every profile ships a WCAG-valid palette (color is Brand-Kit-owned, not theme)", () => {
    for (const [key, profile] of Object.entries(VERTICAL_PROFILES)) {
      const result = validatePalette(profile.palette);
      expect(result.valid, `${key}: ${result.issues.join("; ")}`).toBe(true);
    }
  });

  it("uses vertical-correct vocabulary (a vape shop never says 'Dish')", () => {
    expect(getVerticalProfile("VAPE_SHOP").vocabulary.itemNoun).toBe("Product");
    expect(getVerticalProfile("VAPE_SHOP").vocabulary.catalogNoun).toBe("Shop");
    expect(getVerticalProfile("COFFEE_SHOP").vocabulary.itemNoun).toBe("Drink");
    expect(getVerticalProfile("DELI").vocabulary.itemNoun).toBe("Item");
    expect(getVerticalProfile("RESTAURANT").vocabulary.itemNoun).toBe("Dish");
  });

  it("falls back to the OTHER profile for an unknown vertical", () => {
    expect(getVerticalProfile("FLORIST").vertical).toBe("OTHER");
  });
});

describe("resolveVertical", () => {
  it("prefers an explicit enum vertical", () => {
    expect(resolveVertical("DELI", brandProfile("anything"))).toBe("DELI");
  });
  it("infers the vertical from the business-type text when no enum is given", () => {
    expect(resolveVertical(undefined, brandProfile("vape shop"))).toBe("VAPE_SHOP");
    expect(resolveVertical(undefined, brandProfile("specialty coffee roaster"))).toBe("COFFEE_SHOP");
    expect(resolveVertical(undefined, brandProfile("corner deli"))).toBe("DELI");
    expect(resolveVertical(undefined, brandProfile("italian bistro"))).toBe("RESTAURANT");
  });
  it("returns OTHER when nothing matches", () => {
    expect(resolveVertical(undefined, brandProfile("mystery business"))).toBe("OTHER");
  });
});
