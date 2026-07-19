import { describe, expect, it } from "vitest";
import { buildSiteDefinition } from "./assemble";
import { deliSubPlaceholder, deliTilePlaceholder } from "./renderer/placeholder-imagery";
import { renderPage } from "./renderer/render-page";
import type { RenderContext, RenderReview, ServiceAvailability } from "./renderer/render-context";
import { THEME_CATALOG } from "./theme-catalog";
import { selectThemesForAllFamilies } from "./theme-matching";
import type { BrandProfile, ContentCore, IngestData, ThemeCatalogEntry } from "./types";

const counter = THEME_CATALOG.find((t) => t.key === "deli-counter") as ThemeCatalogEntry;

// The five deli categories from the Counter brief.
const ingest: IngestData = {
  restaurantId: "r1",
  restaurantName: "Vito's Corner Deli",
  description: "Neighborhood deli since 1982.",
  address: "412 Elm St, Springfield, IL 62704",
  phone: "555-0182",
  menu: [
    { categoryName: "Breakfast", name: "Bacon Egg & Cheese", description: "Crispy bacon, two eggs, cheddar", priceCents: 850 },
    { categoryName: "Sandwiches", name: "The Italian", description: "Ham, salami, capicola, provolone, hots", priceCents: 1100 },
    { categoryName: "Lunch Specials", name: "Soup + Half Sandwich", description: "Cup of soup, half deli sandwich", priceCents: 950 },
    { categoryName: "Family Meals", name: "Family Sub Platter", description: "Three foot-long subs, sliced", priceCents: 3600 },
    { categoryName: "Catering", name: "Deli Party Box (10)", description: "Assorted subs, chips, pickles", priceCents: 8500 },
  ],
  photoCount: 0,
  businessType: "DELI",
};

// Bold, casual, neighbourhood — the Counter identity.
const deliProfile: BrandProfile = {
  cuisine: "deli",
  businessType: "deli",
  priceTier: 2,
  personality: { traditionalContemporary: 0.6, casualFormal: 0.12, playfulSerious: 0.28, understatedBold: 0.9, rusticPolished: 0.35 },
  signalsUsed: [],
  confidence: { cuisine: 0.9, businessType: 0.9, priceTier: 0.9, personality: 0.9 },
};

const content: ContentCore = {
  tagline: "Piled high since '82",
  heroHeadline: "Piled high since '82",
  heroSubhead: "Real subs, breakfast, and lunch specials — order ahead and skip the line.",
  aboutStory: "A neighborhood deli three generations deep.",
  signatureDishesIntro: "The regulars' favorites.",
  galleryIntro: "",
  ctaLabel: "Order now",
};

function buildCounterDefinition() {
  return buildSiteDefinition({ ingest, brandProfile: deliProfile, family: "MODERN", theme: counter, content, colorSeed: counter.tokens.colorSeed });
}

const ALL_SERVICES: ServiceAvailability = { pickup: true, delivery: true, dineIn: false, reservations: false };
const REAL_REVIEWS: RenderReview[] = [{ author: "Mike", rating: 5, quote: "Best Italian sub in the neighborhood, no contest." }];

function ctxFor(
  definition: ReturnType<typeof buildSiteDefinition>,
  opts: { services?: ServiceAvailability; reviews?: RenderReview[] } = {},
): RenderContext {
  return {
    siteId: "site-1",
    restaurantId: "r1",
    orderingBaseUrl: "http://localhost:3000",
    bestSellers: [],
    activeOffers: [],
    loyaltyProgram: null,
    definition,
    liveMenu: [
      { name: "Breakfast", items: [{ name: "Bacon Egg & Cheese", description: "Crispy bacon, two eggs, cheddar", priceCents: 850, isAvailable: true }] },
      { name: "Sandwiches", items: [{ name: "The Italian", description: "Ham, salami, capicola, provolone, hots", priceCents: 1100, isAvailable: true }] },
      { name: "Lunch Specials", items: [{ name: "Soup + Half Sandwich", description: "Cup of soup, half deli sandwich", priceCents: 950, isAvailable: true }] },
      { name: "Family Meals", items: [{ name: "Family Sub Platter", description: "Three foot-long subs, sliced", priceCents: 3600, isAvailable: true }] },
      { name: "Catering", items: [{ name: "Deli Party Box (10)", description: "Assorted subs, chips, pickles", priceCents: 8500, isAvailable: true }] },
    ],
    assets: { galleryImages: [] },
    services: opts.services,
    reviews: opts.reviews,
  };
}

describe("deli-counter — catalog entry", () => {
  it("is a well-formed, non-deprecated, DELI-scoped MODERN design system", () => {
    expect(counter).toBeDefined();
    expect(counter.deprecated).toBeFalsy();
    expect(counter.styleFamily).toBe("MODERN");
    expect(counter.businessTypes).toEqual(["DELI"]);
    expect(counter.tokens.colorSeed).toMatch(/^#[0-9a-fA-F]{6}$/);
    // Utility-first: no hard photo requirement, so a brand-new deli with zero
    // photos still renders fully via the self-contained deli imagery.
    expect(counter.constraints.minPhotos).toBeUndefined();
  });

  it("composes the homepage from the section grammar (hero-first, footer-last) with the utility deli sections", () => {
    const home = counter.layouts.home;
    expect(home[0]).toBe("hero");
    expect(home.at(-1)).toBe("footer");
    expect(home).toContain("featuredProducts");
    expect(home).toContain("featuredCategories");
    expect(home).toContain("serviceOptions");
    expect(home).toContain("reviews");
    expect(home).toContain("hoursLocation");
  });

  it("declares the bold deli presentation defaults (counter hero, deli-board menu, bold chrome)", () => {
    expect(counter.variants.hero[0]).toBe("counter");
    expect(counter.variants.menuLayout[0]).toBe("deli-board");
    expect(counter.variants.chrome[0]).toBe("bold");
    expect(counter.presentation?.header?.showOrderButton).toBe(true);
    expect(counter.presentation?.productPresentation?.priceStyle).toBe("bold");
    expect(counter.presentation?.brandSettings?.primaryColor).toBe("#1F6B4A");
    expect(counter.presentation?.brandSettings?.backgroundColor).toBe("#FBF3E4");
  });
});

describe("deli-counter — theme selection", () => {
  it("is selected as the MODERN design system for a DELI tenant (business-type match dominates)", () => {
    const result = selectThemesForAllFamilies(THEME_CATALOG, deliProfile, 0, "DELI");
    expect(result.MODERN.theme.key).toBe("deli-counter");
    expect(result.MODERN.reasons[0]).toMatch(/purpose-built for deli/i);
  });

  it("never leaks to a non-DELI tenant — a restaurant's MODERN variation stays type-agnostic", () => {
    const result = selectThemesForAllFamilies(THEME_CATALOG, deliProfile, 3, "RESTAURANT");
    expect(result.MODERN.theme.key).not.toBe("deli-counter");
    expect([result.LUXURY.theme.key, result.MODERN.theme.key, result.MINIMAL.theme.key]).not.toContain("deli-counter");
  });
});

describe("deli-counter — assembly copies presentation into the definition", () => {
  it("copies header, footer, productPresentation and brand tokens, and titles the favourites section for a deli", () => {
    const def = buildCounterDefinition();
    expect(def.header?.stickyHeader).toBe(true);
    expect(def.footer?.showHours).toBe(true);
    expect(def.productPresentation?.priceStyle).toBe("bold");
    expect(def.brandSettings?.primaryColor).toBe("#1F6B4A");
    const home = def.pages.find((p) => p.slug === "/")!;
    const featured = home.sections.find((s) => s.type === "featuredProducts");
    expect(featured?.props.title).toBe("Piled-High Favorites");
  });
});

describe("deli-counter — home & menu rendering", () => {
  it("renders the bold deli storefront wired to real tenant data", () => {
    const def = buildCounterDefinition();
    const home = def.pages.find((p) => p.slug === "/")!;
    const html = renderPage({ ctx: ctxFor(def, { services: ALL_SERVICES, reviews: REAL_REVIEWS }), page: home, theme: counter, siteUrl: "https://example.com" });

    // Bold chrome + counter hero + mobile sticky CTA
    expect(html).toContain("chrome-bold");
    expect(html).toContain("hero--counter");
    expect(html).toContain("mobile-action-bar");
    // Menu-driven sections wired to the real live menu
    expect(html).toContain('class="featured-products"');
    expect(html).toContain('class="featured-categories"');
    expect(html).toContain("Piled-High Favorites");
    expect(html).toContain("The Italian");
    // Real service options + real reviews (no fabrication)
    expect(html).toContain('class="service-options"');
    expect(html).toContain("Pickup");
    expect(html).toContain('class="reviews"');
    expect(html).toContain("Best Italian sub in the neighborhood, no contest.");
    // Brand token override applied by theme-css (background passes through verbatim)
    expect(html).toContain("#FBF3E4");
    expect(html.toLowerCase()).toContain("footer");
  });

  it("renders the deli-board menu with every category and no fabricated content", () => {
    const def = buildCounterDefinition();
    const menu = def.pages.find((p) => p.slug === "/menu")!;
    const html = renderPage({ ctx: ctxFor(def, {}), page: menu, theme: counter, siteUrl: "https://example.com" });

    for (const category of ["Breakfast", "Sandwiches", "Lunch Specials", "Family Meals", "Catering"]) {
      expect(html).toContain(category);
    }
    // Bold hard-edged order tickets — the deli-board signature border.
    expect(html).toContain("border:2px solid var(--color-surface-900)");
  });

  it("gracefully omits the service and reviews sections when the deli has enabled neither", () => {
    const def = buildCounterDefinition();
    const home = def.pages.find((p) => p.slug === "/")!;
    const html = renderPage({ ctx: ctxFor(def, {}), page: home, theme: counter, siteUrl: "https://example.com" });

    expect(html).not.toContain('class="service-options"');
    expect(html).not.toContain('class="reviews"');
    // The rest of the storefront still renders.
    expect(html).toContain("hero--counter");
    expect(html).toContain('class="featured-products"');
  });
});

describe("deli-counter — self-contained imagery (no external hotlinks)", () => {
  it("generates deterministic inline SVG data URIs for both deli generators", () => {
    for (const gen of [deliSubPlaceholder, deliTilePlaceholder]) {
      const a = gen("The Italian");
      const b = gen("The Italian");
      const c = gen("Breakfast");
      expect(a).toBe(b); // deterministic on the seed
      expect(a).not.toBe(c); // different seeds vary
      expect(a.startsWith("data:image/svg+xml;base64,")).toBe(true);
    }
  });

  it("never references an external image host", () => {
    for (const seed of ["Breakfast", "Sandwiches", "Lunch Specials", "Family Meals", "Catering"]) {
      for (const gen of [deliSubPlaceholder, deliTilePlaceholder]) {
        const decoded = Buffer.from(gen(seed).split(",")[1], "base64").toString("utf8");
        // Strip the SVG xmlns (which legitimately contains an http URL) before asserting.
        const withoutXmlns = decoded.replace(/xmlns="[^"]*"/g, "");
        expect(withoutXmlns).not.toMatch(/https?:\/\//);
      }
    }
  });
});
