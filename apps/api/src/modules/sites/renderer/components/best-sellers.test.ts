import { describe, expect, it } from "vitest";
import { renderBestSellers } from "./best-sellers";
import type { RenderContext } from "../render-context";
import type { SiteDefinition } from "../../types";

function ctx(bestSellers: RenderContext["bestSellers"]): RenderContext {
  return {
    siteId: "site-1",
    restaurantId: "restaurant-1",
    orderingBaseUrl: "http://localhost:3000",
    bestSellers,
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
    liveMenu: [],
    assets: { galleryImages: [] },
  };
}

describe("renderBestSellers", () => {
  it("renders nothing when there's no real order history yet", () => {
    expect(renderBestSellers({ type: "bestSellers", props: {} }, ctx([]))).toBe("");
  });

  it("renders each real best-seller with its actual sold count, ranked", () => {
    const html = renderBestSellers(
      { type: "bestSellers", props: {} },
      ctx([
        { menuItemId: "m1", name: "Spaghetti", quantitySold: 42 },
        { menuItemId: "m2", name: "Tiramisu", quantitySold: 30 },
      ]),
    );
    expect(html).toContain("Spaghetti");
    expect(html).toContain("42 sold");
    expect(html).toContain("Tiramisu");
    expect(html).toContain("#1");
    expect(html).toContain("#2");
  });

  it("respects a configured limit", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ menuItemId: `m${i}`, name: `Item ${i}`, quantitySold: 10 - i }));
    const html = renderBestSellers({ type: "bestSellers", props: { limit: 3 } }, ctx(items));
    expect(html).toContain("Item 0");
    expect(html).toContain("Item 2");
    expect(html).not.toContain("Item 3");
  });

  it("escapes item names", () => {
    const html = renderBestSellers({ type: "bestSellers", props: {} }, ctx([{ menuItemId: "m1", name: "<script>x</script>", quantitySold: 1 }]));
    expect(html).not.toContain("<script>x</script>");
  });
});
