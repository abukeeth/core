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

  it("§Website Builder: renders a real uploaded category photo when one exists", () => {
    const html = renderFeaturedCategories(
      { type: "featuredCategories", props: {} },
      ctx([{ name: "Mains", imageUrl: "/assets/mains.png", items: [{ name: "Spaghetti", priceCents: 1500, isAvailable: true }] }]),
    );
    expect(html).toContain('<img src="/assets/mains.png"');
  });

  it("§Website Builder: falls back to a polished non-photographic tile when a category has no uploaded photo", () => {
    const html = renderFeaturedCategories(
      { type: "featuredCategories", props: {} },
      ctx([{ name: "Mains", items: [{ name: "Spaghetti", priceCents: 1500, isAvailable: true }] }]),
    );
    expect(html).not.toContain("<img");
    expect(html).toContain(">M<");
  });

  it("escapes category names", () => {
    const html = renderFeaturedCategories(
      { type: "featuredCategories", props: {} },
      ctx([{ name: "<script>x</script>", items: [{ name: "Item", priceCents: 100, isAvailable: true }] }]),
    );
    expect(html).not.toContain("<script>x</script>");
  });
});
