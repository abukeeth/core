import { describe, expect, it } from "vitest";
import { THEME_CATALOG } from "./theme-catalog";

describe("THEME_CATALOG", () => {
  it("keeps at least two themes in each of the three style families (deprecated ones kept for backward compatibility, plus V3 business-type themes)", () => {
    for (const family of ["LUXURY", "MODERN", "MINIMAL"] as const) {
      const count = THEME_CATALOG.filter((t) => t.styleFamily === family).length;
      // Lower bound guards the family fallback (every family must always have a
      // selectable theme). No tight upper bound: Theme Engine V3 adds one real
      // business-type theme at a time (restaurant-maison, deli-counter, …), so
      // families grow as new verticals ship.
      expect(count).toBeGreaterThanOrEqual(2);
    }
  });

  it("registers the expected non-deprecated (selectable) design systems per family (V3 business-type themes sit alongside the base family theme)", () => {
    const activeByFamily = (family: "LUXURY" | "MODERN" | "MINIMAL") =>
      THEME_CATALOG.filter((t) => t.styleFamily === family && !t.deprecated)
        .map((t) => t.key)
        .sort();
    // Theme Engine V3 adds one real business-type theme per family as verticals
    // ship: restaurant-maison (LUXURY) for fine-dining, deli-counter (MODERN)
    // for neighbourhood delis — each alongside the base selectable theme.
    expect(activeByFamily("MODERN")).toEqual(["deli-counter", "modern-editorial"]);
    expect(activeByFamily("MINIMAL")).toEqual(["warm-local"]);
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
