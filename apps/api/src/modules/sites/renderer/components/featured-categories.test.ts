import { describe, expect, it } from "vitest";
import { renderFeaturedCategories } from "./featured-categories";
import type { RenderContext } from "../render-context";
import type { SiteDefinition } from "../../types";

function ctx(liveMenu: RenderContext["liveMenu"]): RenderContext {
  return {
    siteId: "site-1",
    restaurantId: "restaurant-1",
    orderingBaseUrl: "http://localhost:3000",
    bestSellers: [],
    activeOffers: [],
    loyaltyProgram: null,
    definition: {
      schemaVersion: 1,
      restaurantName: "Trattoria Bella",
      tagline: "x",
      cuisine: "italian",
      businessType: "bistro",
      styleFamily: "MODERN",
      themeKey: "modern-bistro",
      themeVersion: 1,
      colorSeed: "#e8590c",
      typography: { display: "Sora", body: "Inter" },
      facts: { restaurantName: "Trattoria Bella", hasOnlineOrdering: false, hasReservations: false },
      pages: [],
    } as SiteDefinition,
    liveMenu,
    assets: { galleryImages: [] },
  };
}

describe("renderFeaturedCategories", () => {
  it("renders nothing when there are no categories with available items", () => {
    const html = renderFeaturedCategories({ type: "featuredCategories", props: {} }, ctx([]));
    expect(html).toBe("");
  });

  it("Theme Engine V2: shows a real uploaded category photo (layered, with an accessible label) when one exists", () => {
    const html = renderFeaturedCategories(
      { type: "featuredCategories", props: {} },
      ctx([{ name: "Mains", imageUrl: "/assets/mains.png", items: [{ name: "Spaghetti", priceCents: 1500, isAvailable: true }] }]),
    );
    // The uploaded photo is the top layer; a curated stock URL is never substituted for it.
    expect(html).toContain('url("/assets/mains.png")');
    expect(html).toContain('aria-label="Mains"');
    expect(html).not.toContain("images.unsplash.com");
  });

  it("Theme Engine V2: falls back to a curated stock photo layered over a generated gradient (never a text tile) when a category has no uploaded photo", () => {
    const html = renderFeaturedCategories(
      { type: "featuredCategories", props: {} },
      ctx([{ name: "Mains", items: [{ name: "Spaghetti", priceCents: 1500, isAvailable: true }] }]),
    );
    // A real stock photo on top...
    expect(html).toContain("images.unsplash.com");
    // ...over the always-present generated gradient fallback, so it's never an empty box.
    expect(html).toContain("linear-gradient(");
    expect(html).toContain('aria-label="Mains"');
  });

  it("escapes category names", () => {
    const html = renderFeaturedCategories(
      { type: "featuredCategories", props: {} },
      ctx([{ name: "<script>x</script>", items: [{ name: "Item", priceCents: 100, isAvailable: true }] }]),
    );
    expect(html).not.toContain("<script>x</script>");
  });
});
