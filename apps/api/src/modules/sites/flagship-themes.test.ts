import { describe, expect, it } from "vitest";
import { buildSiteDefinition } from "./assemble";
import { renderPage } from "./renderer/render-page";
import { THEME_CATALOG } from "./theme-catalog";
import { selectThemesForAllFamilies } from "./theme-matching";
import type { RenderContext, RenderReview } from "./renderer/render-context";
import type { BrandProfile, ContentCore, IngestData, SiteDefinition } from "./types";

function profile(businessType: string): BrandProfile {
  return {
    cuisine: businessType === "deli" ? "deli" : "",
    businessType,
    priceTier: 2,
    personality: { traditionalContemporary: 0.6, casualFormal: 0.4, playfulSerious: 0.5, understatedBold: 0.85, rusticPolished: 0.7 },
    signalsUsed: [],
    confidence: { cuisine: 0.5, businessType: 0.9, priceTier: 0.8, personality: 0.85 },
  };
}
const content: ContentCore = {
  tagline: "t", heroHeadline: "h", heroSubhead: "s", aboutStory: "a", signatureDishesIntro: "i", galleryIntro: "", ctaLabel: "Order",
};

function deliDef() {
  const ingest: IngestData = {
    restaurantId: "d1", restaurantName: "Deli Co", address: "1 Main St, Town, NY 10001", phone: "555-0000", businessType: "DELI", photoCount: 4,
    menu: [
      { categoryName: "Sandwiches", name: "Reuben", priceCents: 1450 },
      { categoryName: "Sandwiches", name: "Club", priceCents: 1350 },
      { categoryName: "Sides", name: "Chips", priceCents: 400 },
    ],
  };
  const theme = selectThemesForAllFamilies(THEME_CATALOG, profile("deli"), 4, "DELI").MODERN.theme;
  return { theme, def: buildSiteDefinition({ ingest, brandProfile: profile("deli"), family: theme.styleFamily, theme, content, colorSeed: theme.tokens.colorSeed }) };
}

function vapeDef() {
  const ingest: IngestData = {
    restaurantId: "v1", restaurantName: "Volta", address: "88 Market St, City, IL 60000", phone: "555-1111", businessType: "VAPE_SHOP", photoCount: 4,
    menu: [
      { categoryName: "Devices", name: "Pod X2", priceCents: 3499 },
      { categoryName: "E-Liquids", name: "Berry 30ml", priceCents: 1899 },
      { categoryName: "Accessories", name: "Coils", priceCents: 1299 },
    ],
  };
  const theme = selectThemesForAllFamilies(THEME_CATALOG, profile("vape shop"), 4, "VAPE_SHOP").LUXURY.theme;
  return { theme, def: buildSiteDefinition({ ingest, brandProfile: profile("vape shop"), family: theme.styleFamily, theme, content, colorSeed: theme.tokens.colorSeed }) };
}

function ctxFor(def: SiteDefinition, opts: { reviews?: RenderReview[] } = {}): RenderContext {
  return {
    siteId: "s", restaurantId: def.facts.restaurantName === "Volta" ? "v1" : "d1", orderingBaseUrl: "http://localhost:3000",
    bestSellers: [{ menuItemId: "1", name: "Reuben", quantitySold: 90 }], activeOffers: [],
    loyaltyProgram: { isActive: true, pointsPerDollarCents: 1, redemptionRateCentsPerPoint: 5 },
    definition: def, liveMenu: def.pages[0]!.sections.length ? [] : [], assets: { galleryImages: [] },
    services: { pickup: true, delivery: true, dineIn: false, reservations: false }, reviews: opts.reviews,
  } as RenderContext;
}

describe("Flagship themes — DELI selects deli-brooklyn with a bespoke structure", () => {
  it("selects deli-brooklyn and orders the bespoke deli home sections", () => {
    const { theme, def } = deliDef();
    expect(theme.key).toBe("deli-brooklyn");
    const types = def.pages[0]!.sections.map((s) => s.type);
    expect(types).toContain("buildYourOwn");
    expect(types).toContain("comboDeals");
    expect(types).toContain("catering");
    expect(types).not.toContain("ageGate");
  });

  it("renders the deli brand moments and no age gate", () => {
    const { theme, def } = deliDef();
    const html = renderPage({ ctx: ctxFor(def), page: def.pages[0]!, theme, siteUrl: "https://x" });
    expect(html).toContain("Build your own");
    expect(html).toContain("Perfect pairings");
    expect(html).not.toContain("21 or older");
  });
});

describe("Flagship themes — VAPE selects vape-lab with a bespoke structure", () => {
  it("selects vape-lab, keeps the age gate, and expands productCollection per real category", () => {
    const { theme, def } = vapeDef();
    expect(theme.key).toBe("vape-lab");
    const types = def.pages[0]!.sections.map((s) => s.type);
    expect(types).toContain("ageGate");
    expect(types).toContain("featuredBrands");
    expect(types).toContain("storeLocations");
    // One productCollection per real category (Devices / E-Liquids / Accessories).
    expect(types.filter((t) => t === "productCollection")).toHaveLength(3);
  });

  it("renders the age gate, collection strip, and store locations", () => {
    const { theme, def } = vapeDef();
    const html = renderPage({ ctx: ctxFor(def), page: def.pages[0]!, theme, siteUrl: "https://x" });
    expect(html).toContain("21 or older");
    expect(html).toContain("Shop the collection");
    expect(html).toContain("Store locations");
  });
});

describe("Flagship themes — reviews are real-data-gated (never fabricated)", () => {
  it("omits the reviews section entirely with no real reviews, and shows it with them", () => {
    const { theme, def } = deliDef();
    const without = renderPage({ ctx: ctxFor(def, { reviews: [] }), page: def.pages[0]!, theme, siteUrl: "https://x" });
    expect(without).not.toContain("What Customers Say");

    const withReviews = renderPage({
      ctx: ctxFor(def, { reviews: [{ author: "Amara", rating: 5, quote: "Superb." }] }),
      page: def.pages[0]!,
      theme,
      siteUrl: "https://x",
    });
    expect(withReviews).toContain("What Customers Say");
    expect(withReviews).toContain("Amara");
  });
});
