import { describe, expect, it } from "vitest";
import { resolveCategoryImage, resolveHeroImage, resolveHeroInsetImage } from "./asset-resolver";
import type { RenderAssets, RenderContext } from "./render-context";
import type { SiteDefinition } from "../types";

function ctx(assets: Partial<RenderAssets>): RenderContext {
  return {
    siteId: "s1",
    restaurantId: "r1",
    orderingBaseUrl: "http://localhost:3000",
    bestSellers: [],
    activeOffers: [],
    loyaltyProgram: null,
    definition: { restaurantName: "Joe's Deli", businessType: "deli", cuisine: "sandwiches" } as SiteDefinition,
    liveMenu: [],
    assets: { galleryImages: [], ...assets },
  };
}

describe("resolveHeroImage — real → AI → stock (SVG floor applied by caller)", () => {
  it("prefers the real background image, then the real hero image", () => {
    expect(resolveHeroImage(ctx({ heroBackgroundUrl: "/bg.jpg", heroUrl: "/hero.jpg" }))).toBe("/bg.jpg");
    expect(resolveHeroImage(ctx({ heroUrl: "/hero.jpg" }))).toBe("/hero.jpg");
  });

  it("uses the AI slot when no real image exists (Sprint 5.5 populates it)", () => {
    expect(resolveHeroImage(ctx({ aiHeroUrl: "/ai-hero.jpg" }))).toBe("/ai-hero.jpg");
  });

  it("a real image still beats the AI slot", () => {
    expect(resolveHeroImage(ctx({ heroUrl: "/hero.jpg", aiHeroUrl: "/ai-hero.jpg" }))).toBe("/hero.jpg");
  });

  it("returns undefined when nothing resolves (stock manifest empty) → caller applies the SVG floor", () => {
    expect(resolveHeroImage(ctx({}))).toBeUndefined();
  });
});

describe("resolveHeroInsetImage — heroUrl-first precedence preserved", () => {
  it("does not fall back to the full-bleed background image", () => {
    expect(resolveHeroInsetImage(ctx({ heroBackgroundUrl: "/bg.jpg" }))).toBeUndefined();
  });

  it("prefers the foreground hero photo, then the AI slot", () => {
    expect(resolveHeroInsetImage(ctx({ heroUrl: "/hero.jpg", aiHeroUrl: "/ai.jpg" }))).toBe("/hero.jpg");
    expect(resolveHeroInsetImage(ctx({ aiHeroUrl: "/ai.jpg" }))).toBe("/ai.jpg");
  });
});

describe("resolveCategoryImage — real → AI → stock", () => {
  it("prefers the real category image", () => {
    expect(resolveCategoryImage("Drinks", "/real.jpg", ctx({}))).toBe("/real.jpg");
  });

  it("uses the AI category slot when there is no real image", () => {
    expect(resolveCategoryImage("Drinks", undefined, ctx({ aiCategoryImages: { Drinks: "/ai-drinks.jpg" } }))).toBe("/ai-drinks.jpg");
  });

  it("returns undefined when nothing resolves → caller applies the SVG floor", () => {
    expect(resolveCategoryImage("Drinks", undefined, ctx({}))).toBeUndefined();
  });
});
