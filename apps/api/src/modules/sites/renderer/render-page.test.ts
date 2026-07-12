import { describe, expect, it } from "vitest";
import { renderPage } from "./render-page";
import { THEME_CATALOG } from "../theme-catalog";
import type { RenderContext } from "./render-context";
import type { SiteDefinition } from "../types";

const theme = THEME_CATALOG.find((t) => t.key === "modern-bistro")!;

function definition(overrides: Partial<SiteDefinition> = {}): SiteDefinition {
  return {
    schemaVersion: 1,
    restaurantName: "Trattoria Bella",
    tagline: "Handmade pasta, done right",
    cuisine: "italian",
    businessType: "bistro",
    styleFamily: "MODERN",
    themeKey: theme.key,
    themeVersion: theme.version,
    colorSeed: theme.tokens.colorSeed,
    typography: theme.tokens.typography,
    facts: { restaurantName: "Trattoria Bella", address: "123 Main St", phone: "555-0100", hasOnlineOrdering: true, hasReservations: false },
    pages: [
      {
        slug: "/",
        title: "Home — Trattoria Bella | Italian",
        metaDescription: "Handmade pasta, made fresh daily.",
        sections: [
          { type: "hero", props: { headline: "Welcome", subhead: "Fresh pasta daily", ctaLabel: "Order Now" } },
          { type: "footer", props: {} },
        ],
      },
    ],
    ...overrides,
  };
}

function ctx(def: SiteDefinition): RenderContext {
  return { siteId: "site-1", restaurantId: "restaurant-1", orderingBaseUrl: "http://localhost:3000", bestSellers: [], activeOffers: [], loyaltyProgram: null, definition: def, liveMenu: [], assets: { galleryImages: [] } };
}

describe("renderPage", () => {
  it("produces a well-formed HTML5 document", () => {
    const def = definition();
    const html = renderPage({ ctx: ctx(def), page: def.pages[0], theme, siteUrl: "https://example.com" });
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain("<html lang=\"en\">");
    expect(html).toContain("</html>");
  });

  it("includes the page title, meta description, and canonical URL", () => {
    const def = definition();
    const html = renderPage({ ctx: ctx(def), page: def.pages[0], theme, siteUrl: "https://example.com" });
    expect(html).toContain("<title>Home — Trattoria Bella | Italian</title>");
    expect(html).toContain('name="description" content="Handmade pasta, made fresh daily."');
    expect(html).toContain('rel="canonical" href="https://example.com"');
  });

  it("includes JSON-LD structured data", () => {
    const def = definition();
    const html = renderPage({ ctx: ctx(def), page: def.pages[0], theme, siteUrl: "https://example.com" });
    expect(html).toContain('"@type":"Restaurant"');
    expect(html).toContain('"@type":"BreadcrumbList"');
  });

  it("adds a noindex robots tag for preview rendering but not production", () => {
    const def = definition();
    const preview = renderPage({ ctx: ctx(def), page: def.pages[0], theme, siteUrl: "https://example.com", noindex: true });
    const production = renderPage({ ctx: ctx(def), page: def.pages[0], theme, siteUrl: "https://example.com" });
    expect(preview).toContain('name="robots" content="noindex, nofollow"');
    expect(production).not.toContain("noindex");
  });

  it("escapes an XSS attempt in the restaurant name everywhere it appears", () => {
    const def = definition({ restaurantName: "<script>alert(1)</script>" });
    const html = renderPage({ ctx: ctx(def), page: def.pages[0], theme, siteUrl: "https://example.com" });
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("escapes an XSS attempt in a hero headline", () => {
    const def = definition();
    def.pages[0].sections[0] = { type: "hero", props: { headline: "<img src=x onerror=alert(1)>", subhead: "", ctaLabel: "Go" } };
    const html = renderPage({ ctx: ctx(def), page: def.pages[0], theme, siteUrl: "https://example.com" });
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
  });

  it("is deterministic — same definition + theme + page produces identical output", () => {
    const def = definition();
    const first = renderPage({ ctx: ctx(def), page: def.pages[0], theme, siteUrl: "https://example.com" });
    const second = renderPage({ ctx: ctx(def), page: def.pages[0], theme, siteUrl: "https://example.com" });
    expect(first).toBe(second);
  });

  it("includes the theme's CSS custom properties", () => {
    const def = definition();
    const html = renderPage({ ctx: ctx(def), page: def.pages[0], theme, siteUrl: "https://example.com" });
    expect(html).toContain("--color-primary-500:");
  });

  it("includes a mobile action bar with a call link when a phone number exists", () => {
    const def = definition();
    const html = renderPage({ ctx: ctx(def), page: def.pages[0], theme, siteUrl: "https://example.com" });
    expect(html).toContain('href="tel:5550100"');
  });
});
