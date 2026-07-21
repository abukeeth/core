import { describe, expect, it } from "vitest";
import { STOCK_LIBRARY, matchStock, stockCategoryImage, stockHeroImage, type StockImage } from "./stock-library";

const FIXTURE: StockImage[] = [
  { url: "/stock/deli-hero.jpg", alt: "deli", keywords: ["hero", "counter"], verticals: ["deli"] },
  { url: "/stock/deli-drinks.jpg", alt: "drinks", keywords: ["drinks", "beverages"], verticals: ["deli"] },
  { url: "/stock/cafe-hero.jpg", alt: "cafe", keywords: ["hero", "coffee"], verticals: ["coffee_shop", "cafe"] },
];

describe("matchStock", () => {
  it("returns undefined for an empty library", () => {
    expect(matchStock([], "deli", ["hero"])).toBeUndefined();
  });

  it("matches by vertical then prefers a keyword hit", () => {
    expect(matchStock(FIXTURE, "deli", ["drinks"])).toBe("/stock/deli-drinks.jpg");
    expect(matchStock(FIXTURE, "cafe", ["hero"])).toBe("/stock/cafe-hero.jpg");
  });

  it("falls back to the first vertical match when no keyword matches", () => {
    expect(matchStock(FIXTURE, "deli", ["nonexistent"])).toBe("/stock/deli-hero.jpg");
  });

  it("falls back to the whole library when the vertical is unknown", () => {
    expect(matchStock(FIXTURE, "florist", ["hero"])).toBe("/stock/deli-hero.jpg");
  });
});

describe("stockHeroImage / stockCategoryImage (production manifest)", () => {
  it("the production manifest is empty until a licensed pack is loaded → resolver falls through", () => {
    expect(STOCK_LIBRARY).toHaveLength(0);
    expect(stockHeroImage("deli")).toBeUndefined();
    expect(stockCategoryImage("deli", "Drinks")).toBeUndefined();
  });
});
