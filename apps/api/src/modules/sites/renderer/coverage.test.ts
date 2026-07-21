import { describe, expect, it } from "vitest";
import type { LiveMenuCategory } from "./render-context";
import {
  COVERAGE_THRESHOLD,
  TYPOGRAPHIC_CATALOG_VARIANT,
  catalogImageCoverage,
  selectCatalogLayout,
} from "./coverage";

/** Build a flat single-category catalog of N items, the first `withImage` of which carry a photo. */
function catalog(total: number, withImage: number): LiveMenuCategory[] {
  return [
    {
      name: "Mains",
      items: Array.from({ length: total }, (_, i) => ({
        name: `Item ${i}`,
        priceCents: 100,
        isAvailable: true,
        imageUrl: i < withImage ? `/assets/item-${i}.png` : undefined,
      })),
    },
  ];
}

describe("catalogImageCoverage", () => {
  it("is 0 for an empty catalog", () => {
    expect(catalogImageCoverage([])).toBe(0);
    expect(catalogImageCoverage([{ name: "Empty", items: [] }])).toBe(0);
  });

  it("computes the fraction of items that carry an image", () => {
    expect(catalogImageCoverage(catalog(1, 0))).toBe(0); // 0%
    expect(catalogImageCoverage(catalog(5, 1))).toBeCloseTo(0.2); // 20%
    expect(catalogImageCoverage(catalog(2, 1))).toBe(0.5); // 50%
    expect(catalogImageCoverage(catalog(1, 1))).toBe(1); // 100%
  });

  it("counts across multiple categories", () => {
    const menu: LiveMenuCategory[] = [
      { name: "A", items: [{ name: "a1", priceCents: 100, isAvailable: true, imageUrl: "/a1.png" }] },
      { name: "B", items: [{ name: "b1", priceCents: 100, isAvailable: true }] },
    ];
    expect(catalogImageCoverage(menu)).toBe(0.5);
  });

  it("treats an empty-string imageUrl as no image", () => {
    const menu: LiveMenuCategory[] = [
      { name: "A", items: [{ name: "a1", priceCents: 100, isAvailable: true, imageUrl: "   " }] },
    ];
    expect(catalogImageCoverage(menu)).toBe(0);
  });
});

describe("selectCatalogLayout — photo-forward variants", () => {
  it("0% coverage → routes a photo grid to the typographic menu", () => {
    expect(selectCatalogLayout("warm-cards", 0)).toBe(TYPOGRAPHIC_CATALOG_VARIANT);
    expect(selectCatalogLayout("bold-grid", 0)).toBe(TYPOGRAPHIC_CATALOG_VARIANT);
  });

  it("20% coverage → still below threshold → typographic", () => {
    expect(selectCatalogLayout("warm-cards", 0.2)).toBe(TYPOGRAPHIC_CATALOG_VARIANT);
    expect(selectCatalogLayout("bold-grid", 0.2)).toBe(TYPOGRAPHIC_CATALOG_VARIANT);
  });

  it("50% coverage → at/above threshold → keeps the theme grid", () => {
    expect(selectCatalogLayout("warm-cards", 0.5)).toBe("warm-cards");
    expect(selectCatalogLayout("bold-grid", 0.5)).toBe("bold-grid");
  });

  it("100% coverage → keeps the theme grid", () => {
    expect(selectCatalogLayout("warm-cards", 1)).toBe("warm-cards");
    expect(selectCatalogLayout("bold-grid", 1)).toBe("bold-grid");
  });

  it("the threshold is inclusive of the grid (>= keeps the grid)", () => {
    expect(selectCatalogLayout("warm-cards", COVERAGE_THRESHOLD)).toBe("warm-cards");
    expect(selectCatalogLayout("warm-cards", COVERAGE_THRESHOLD - 0.0001)).toBe(TYPOGRAPHIC_CATALOG_VARIANT);
  });
});

describe("selectCatalogLayout — variants that must never be overridden", () => {
  it("already-typographic variants are unchanged at any coverage", () => {
    expect(selectCatalogLayout("editorial-menu", 0)).toBe("editorial-menu");
    expect(selectCatalogLayout("editorial-rows", 0)).toBe("editorial-rows");
  });

  it("deprecated/legacy variants are unchanged (byte-identical guarantee)", () => {
    expect(selectCatalogLayout("card-grid", 0)).toBe("card-grid");
    expect(selectCatalogLayout("two-column-elegant", 0)).toBe("two-column-elegant");
    expect(selectCatalogLayout("classic-list", 0)).toBe("classic-list");
  });

  it("the default (undefined) layout is left to the renderer's default path", () => {
    expect(selectCatalogLayout(undefined, 0)).toBeUndefined();
    expect(selectCatalogLayout(undefined, 1)).toBeUndefined();
  });
});
