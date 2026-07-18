import { describe, expect, it } from "vitest";
import { buildSiteDefinition } from "./assemble";
import { renderPage } from "./renderer/render-page";
import type { RenderContext, RenderReview, ServiceAvailability } from "./renderer/render-context";
import { THEME_CATALOG } from "./theme-catalog";
import { selectThemesForAllFamilies } from "./theme-matching";
import type { BrandProfile, ContentCore, IngestData, ThemeCatalogEntry } from "./types";

const maison = THEME_CATALOG.find((t) => t.key === "restaurant-maison") as ThemeCatalogEntry;

const ingest: IngestData = {
  restaurantId: "r1",
  restaurantName: "Maison Laurent",
  description: "A refined French kitchen.",
  address: "8 Rue Vert, Springfield, IL 62704",
  phone: "555-0100",
  menu: [
    { categoryName: "Entrées", name: "Duck confit", description: "Cherry, thyme", priceCents: 4200 },
    { categoryName: "Entrées", name: "Turbot", description: "Line-caught", priceCents: 4800 },
    { categoryName: "Desserts", name: "Tarte tatin", priceCents: 1400 },
  ],
  photoCount: 4,
};

const fineDiningProfile: BrandProfile = {
  cuisine: "french",
  businessType: "fine dining",
  priceTier: 4,
  personality: { traditionalContemporary: 0.35, casualFormal: 0.9, playfulSerious: 0.85, understatedBold: 0.4, rusticPolished: 0.92 },
  signalsUsed: [],
  confidence: { cuisine: 0.9, businessType: 0.9, priceTier: 0.9, personality: 0.9 },
};

const content: ContentCore = {
  tagline: "Handmade, every service",
  heroHeadline: "A table worth keeping",
  heroSubhead: "Seasonal tasting menu, nightly.",
  aboutStory: "Founded by the Laurent family in 1998.",
  signatureDishesIntro: "A few favourites.",
  galleryIntro: "Inside the room.",
  ctaLabel: "Reserve",
};

function buildMaisonDefinition() {
  return buildSiteDefinition({ ingest, brandProfile: fineDiningProfile, family: "LUXURY", theme: maison, content, colorSeed: maison.tokens.colorSeed });
}

const ALL_SERVICES: ServiceAvailability = { pickup: true, delivery: true, dineIn: true, reservations: false };
const REAL_REVIEWS: RenderReview[] = [{ author: "Amara", rating: 5, quote: "Impeccable from start to finish." }];

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
      {
        name: "Entrées",
        items: [
          { name: "Duck confit", description: "Cherry, thyme", priceCents: 4200, isAvailable: true },
          { name: "Turbot", description: "Line-caught", priceCents: 4800, isAvailable: true },
        ],
      },
      { name: "Desserts", items: [{ name: "Tarte tatin", priceCents: 1400, isAvailable: true }] },
    ],
    assets: { galleryImages: [] },
    services: opts.services,
    reviews: opts.reviews,
  };
}

describe("restaurant-maison — catalog entry", () => {
  it("is a well-formed, non-deprecated LUXURY design system", () => {
    expect(maison).toBeDefined();
    expect(maison.deprecated).toBeFalsy();
    expect(maison.styleFamily).toBe("LUXURY");
    expect(maison.tokens.colorSeed).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(maison.constraints.minPhotos).toBe(2);
  });

  it("composes the homepage from the section grammar (hero-first, footer-last) including the V3 sections", () => {
    const home = maison.layouts.home;
    expect(home[0]).toBe("hero");
    expect(home.at(-1)).toBe("footer");
    expect(home).toContain("featuredCategories");
    expect(home).toContain("featuredProducts");
    expect(home).toContain("serviceOptions");
    expect(home).toContain("reviews");
    expect(home).toContain("hoursLocation");
  });

  it("declares reusable presentation defaults (chrome header, footer, brand tokens)", () => {
    expect(maison.variants.hero[0]).toBe("fullbleed-image");
    expect(maison.variants.chrome[0]).toBe("editorial");
    expect(maison.presentation?.header?.announcementBar?.enabled).toBe(true);
    expect(maison.presentation?.header?.showOrderButton).toBe(true);
    expect(maison.presentation?.brandSettings?.accentColor).toBe("#B08D57");
    expect(maison.presentation?.brandSettings?.backgroundColor).toBe("#FBF7F0");
  });
});

describe("restaurant-maison — theme selection", () => {
  it("is selected as the LUXURY design system for a polished fine-dining brand", () => {
    const result = selectThemesForAllFamilies(THEME_CATALOG, fineDiningProfile, 4);
    expect(result.LUXURY.theme.key).toBe("restaurant-maison");
  });
});

describe("restaurant-maison — assembly copies presentation into the definition", () => {
  it("copies header, footer, productPresentation and brand tokens, and titles the popular-dishes section", () => {
    const def = buildMaisonDefinition();
    expect(def.header?.stickyHeader).toBe(true);
    expect(def.footer?.showHours).toBe(true);
    expect(def.productPresentation?.priceStyle).toBe("minimal");
    expect(def.brandSettings?.backgroundColor).toBe("#FBF7F0");
    const home = def.pages.find((p) => p.slug === "/")!;
    const featured = home.sections.find((s) => s.type === "featuredProducts");
    expect(featured?.props.title).toBe("Popular Dishes");
  });
});

describe("restaurant-maison — home rendering", () => {
  it("renders the full editorial storefront wired to real tenant data", () => {
    const def = buildMaisonDefinition();
    const home = def.pages.find((p) => p.slug === "/")!;
    const html = renderPage({ ctx: ctxFor(def, { services: ALL_SERVICES, reviews: REAL_REVIEWS }), page: home, theme: maison, siteUrl: "https://example.com" });

    // Chrome + hero + mobile sticky CTA
    expect(html).toContain("chrome-editorial");
    expect(html).toContain("hero--fullbleed-image");
    expect(html).toContain("mobile-action-bar");
    // Menu-driven sections (real live menu)
    expect(html).toContain('class="featured-categories"');
    expect(html).toContain('class="featured-products"');
    expect(html).toContain("Popular Dishes");
    expect(html).toContain("Duck confit");
    // Real service options + real reviews
    expect(html).toContain('class="service-options"');
    expect(html).toContain("Pickup");
    expect(html).toContain('class="reviews"');
    expect(html).toContain("Impeccable from start to finish.");
    // Brand token override applied by theme-css
    expect(html).toContain("#FBF7F0");
    // Location + footer
    expect(html).toContain("Rue Vert");
    expect(html.toLowerCase()).toContain("footer");
  });

  it("gracefully omits the service and reviews sections for a business that has enabled neither (no fabrication)", () => {
    const def = buildMaisonDefinition();
    const home = def.pages.find((p) => p.slug === "/")!;
    const html = renderPage({ ctx: ctxFor(def, {}), page: home, theme: maison, siteUrl: "https://example.com" });

    expect(html).not.toContain('class="service-options"');
    expect(html).not.toContain('class="reviews"');
    // But the rest of the storefront still renders.
    expect(html).toContain("hero--fullbleed-image");
    expect(html).toContain('class="featured-products"');
    expect(html.toLowerCase()).toContain("footer");
  });
});
