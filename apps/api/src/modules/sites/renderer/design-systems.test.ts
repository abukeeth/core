import { describe, expect, it } from "vitest";
import { buildSiteDefinition } from "../assemble";
import { THEME_CATALOG } from "../theme-catalog";
import type { BrandProfile, ContentCore, IngestData } from "../types";
import { renderPage } from "./render-page";
import type { RenderContext } from "./render-context";

const ingest: IngestData = {
  restaurantId: "r1",
  restaurantName: "Trattoria Bella",
  description: "A family-run Italian kitchen.",
  address: "123 Main St, Springfield, IL 62704",
  phone: "555-0100",
  menu: [
    { categoryName: "Mains", name: "Spaghetti Carbonara", description: "Classic Roman pasta", priceCents: 1800 },
    { categoryName: "Mains", name: "Lasagna", priceCents: 2000 },
    { categoryName: "Desserts", name: "Tiramisu", priceCents: 900 },
  ],
  photoCount: 4,
};

const brandProfile: BrandProfile = {
  cuisine: "italian",
  businessType: "bistro",
  priceTier: 3,
  personality: {
    traditionalContemporary: 0.5,
    casualFormal: 0.6,
    playfulSerious: 0.5,
    understatedBold: 0.5,
    rusticPolished: 0.6,
  },
  signalsUsed: [],
  confidence: { cuisine: 0.9, businessType: 0.9, priceTier: 0.9, personality: 0.9 },
};

const content: ContentCore = {
  tagline: "Handmade pasta, done right",
  heroHeadline: "Welcome to Trattoria Bella",
  heroSubhead: "Family recipes, fresh every day.",
  aboutStory: "Founded in 1998 by the Bellini family.",
  signatureDishesIntro: "A few of our favorites.",
  galleryIntro: "A look inside our kitchen.",
  ctaLabel: "View Menu",
};

const ACTIVE_THEMES = THEME_CATALOG.filter((t) => !t.deprecated);

function ctxFor(definition: ReturnType<typeof buildSiteDefinition>): RenderContext {
  return {
    siteId: "site-1",
    restaurantId: "r1",
    orderingBaseUrl: "http://localhost:3000",
    bestSellers: [],
    activeOffers: [],
    loyaltyProgram: null,
    definition,
    // Sprint 5 · T1 — these tests assert each theme's photo-forward grid design
    // system, so the item carries an image (full coverage). Below the coverage
    // threshold a photo grid is intentionally re-routed to the typographic menu
    // (covered in menu-section.test.ts's "Coverage-Aware Layout" block).
    liveMenu: [
      { name: "Mains", items: [{ name: "Spaghetti Carbonara", description: "Classic Roman pasta", priceCents: 1800, isAvailable: true, imageUrl: "/assets/carbonara.png" }] },
    ],
    assets: { galleryImages: [] },
  };
}

describe("§Website Builder — the 3 design systems render materially differently", () => {
  it("registers the active design systems (V3 adds restaurant-maison to the base three)", () => {
    expect(ACTIVE_THEMES.map((t) => t.key).sort()).toEqual(["bold-commerce", "modern-editorial", "restaurant-maison", "warm-local"]);
  });

  it("renders a genuinely different home page for each of the 3 design systems, not just a palette swap", () => {
    const rendered = ACTIVE_THEMES.map((theme) => {
      const definition = buildSiteDefinition({
        ingest,
        brandProfile,
        family: theme.styleFamily,
        theme,
        content,
        colorSeed: theme.tokens.colorSeed,
      });
      const homePage = definition.pages.find((p) => p.slug === "/")!;
      return {
        key: theme.key,
        html: renderPage({ ctx: ctxFor(definition), page: homePage, theme, siteUrl: "https://example.com" }),
      };
    });

    // No two design systems ever produce identical markup for the same input data.
    const htmlSet = new Set(rendered.map((r) => r.html));
    expect(htmlSet.size).toBe(rendered.length);

    const byKey = Object.fromEntries(rendered.map((r) => [r.key, r.html]));

    // Each uses its own hero variant class...
    expect(byKey["modern-editorial"]).toContain("hero--editorial-split");
    expect(byKey["warm-local"]).toContain("hero--warm-frame");
    expect(byKey["bold-commerce"]).toContain("hero--bold-block");

    // ...its own header/nav chrome style...
    expect(byKey["modern-editorial"]).toContain("chrome-editorial");
    expect(byKey["warm-local"]).toContain("chrome-warm");
    expect(byKey["bold-commerce"]).toContain("chrome-bold");
  });

  it("renders a genuinely different menu page category layout for each of the 3 design systems", () => {
    const rendered = ACTIVE_THEMES.map((theme) => {
      const definition = buildSiteDefinition({
        ingest,
        brandProfile,
        family: theme.styleFamily,
        theme,
        content,
        colorSeed: theme.tokens.colorSeed,
      });
      const menuPage = definition.pages.find((p) => p.slug === "/menu")!;
      return {
        key: theme.key,
        html: renderPage({ ctx: ctxFor(definition), page: menuPage, theme, siteUrl: "https://example.com" }),
      };
    });

    const byKey = Object.fromEntries(rendered.map((r) => [r.key, r.html]));
    // Bold Commerce's dense hard-edged grid...
    expect(byKey["bold-commerce"]).toContain("border:2px solid var(--color-surface-900)");
    // ...never appears in the other two design systems' menu markup.
    expect(byKey["modern-editorial"]).not.toContain("border:2px solid var(--color-surface-900)");
    expect(byKey["warm-local"]).not.toContain("border:2px solid var(--color-surface-900)");
  });
});
