import { describe, expect, it } from "vitest";
import { THEME_CATALOG } from "./theme-catalog";

describe("THEME_CATALOG", () => {
  it("keeps each style family to a small set (deprecated + active), room for the vertical themes", () => {
    for (const family of ["LUXURY", "MODERN", "MINIMAL"] as const) {
      const count = THEME_CATALOG.filter((t) => t.styleFamily === family).length;
      expect(count).toBeGreaterThanOrEqual(2);
      // Base + deprecated vertical + flagship vertical themes. LUXURY is the
      // largest: bold-commerce, restaurant-maison, the deprecated vape-vapor,
      // and the flagship vape-lab (plus deprecated base entries) = 6.
      expect(count).toBeLessThanOrEqual(6);
    }
  });

  it("registers the expected non-deprecated (selectable) design systems per family (LUXURY carries the V3 restaurant-maison alongside bold-commerce)", () => {
    const activeByFamily = (family: "LUXURY" | "MODERN" | "MINIMAL") =>
      THEME_CATALOG.filter((t) => t.styleFamily === family && !t.deprecated)
        .map((t) => t.key)
        .sort();
    // Each family carries the type-agnostic base systems plus the flagship
    // vertical themes (deli-brooklyn / cafe-daybreak / vape-lab). The earlier
    // deli-counter / vape-vapor are deprecated (superseded by the flagships).
    expect(activeByFamily("MODERN")).toEqual(["deli-brooklyn", "modern-editorial"]);
    expect(activeByFamily("MINIMAL")).toEqual(["cafe-daybreak", "warm-local"]);
    // LUXURY carries restaurant-maison (RESTAURANT) and vape-lab (VAPE_SHOP)
    // alongside the type-agnostic bold-commerce.
    expect(activeByFamily("LUXURY")).toEqual(["bold-commerce", "restaurant-maison", "vape-lab"]);
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
