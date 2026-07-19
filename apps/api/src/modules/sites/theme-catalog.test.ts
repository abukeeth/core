import { describe, expect, it } from "vitest";
import { THEME_CATALOG } from "./theme-catalog";

describe("THEME_CATALOG", () => {
  it("has 2-4 themes in each of the three style families, counting deprecated ones kept for backward compatibility", () => {
    for (const family of ["LUXURY", "MODERN", "MINIMAL"] as const) {
      const count = THEME_CATALOG.filter((t) => t.styleFamily === family).length;
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(4);
    }
  });

  it("registers the expected non-deprecated (selectable) design systems per family (LUXURY carries the V3 restaurant-maison alongside bold-commerce)", () => {
    const activeByFamily = (family: "LUXURY" | "MODERN" | "MINIMAL") =>
      THEME_CATALOG.filter((t) => t.styleFamily === family && !t.deprecated)
        .map((t) => t.key)
        .sort();
    expect(activeByFamily("MODERN")).toEqual(["modern-editorial"]);
    expect(activeByFamily("MINIMAL")).toEqual(["warm-local"]);
    // Theme Engine V3 adds restaurant-maison as a second selectable LUXURY
    // design system; theme-matching picks it for polished fine-dining brands.
    expect(activeByFamily("LUXURY")).toEqual(["bold-commerce", "restaurant-maison"]);
  });

  it("has unique key+version pairs", () => {
    const keys = THEME_CATALOG.map((t) => `${t.key}@${t.version}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every theme a valid 6-digit hex color seed", () => {
    for (const theme of THEME_CATALOG) {
      expect(theme.tokens.colorSeed).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("keeps every personality axis within 0-1", () => {
    for (const theme of THEME_CATALOG) {
      for (const value of Object.values(theme.personalityVector)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("gives every theme's home layout a non-empty hero-first, footer-last section order", () => {
    for (const theme of THEME_CATALOG) {
      expect(theme.layouts.home[0]).toBe("hero");
      expect(theme.layouts.home.at(-1)).toBe("footer");
    }
  });

  it("gives Minimal themes no hard photo constraint (typographic hero fallback)", () => {
    for (const theme of THEME_CATALOG.filter((t) => t.styleFamily === "MINIMAL")) {
      expect(theme.constraints.minPhotos).toBeUndefined();
    }
  });
});
