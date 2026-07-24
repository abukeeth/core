import { describe, expect, it } from "vitest";
import { renderProductCard } from "./product-card";
import type { RenderContext } from "../render-context";

function ctx(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    siteId: "s1",
    restaurantId: "r1",
    orderingBaseUrl: "http://localhost:3000",
    bestSellers: [],
    activeOffers: [],
    loyaltyProgram: null,
    definition: { themeKey: "deli-brooklyn", restaurantName: "Deli" } as RenderContext["definition"],
    liveMenu: [],
    assets: { galleryImages: [] },
    ...overrides,
  } as RenderContext;
}

const reuben = { name: "The Reuben", description: "Pastrami, rye", priceCents: 1450 };

describe("renderProductCard — real signals only (§2 Guardrails)", () => {
  it("shows a Best Seller badge for a deli item that is a real best seller", () => {
    const c = ctx({ bestSellers: [{ menuItemId: "1", name: "The Reuben", quantitySold: 100 }] });
    const html = renderProductCard(reuben, c, { style: "deli" });
    expect(html).toContain("Best Seller");
    expect(html).toContain("$14.50");
    expect(html).toContain("Quick Add");
  });

  it("shows NO badge when the item is not a real best seller", () => {
    const html = renderProductCard(reuben, ctx(), { style: "deli" });
    expect(html).not.toContain("Best Seller");
  });

  it("shows a Trending badge for a vape best seller, and Add CTA", () => {
    const c = ctx({
      definition: { themeKey: "vape-lab", restaurantName: "Volta" } as RenderContext["definition"],
      bestSellers: [{ menuItemId: "1", name: "The Reuben", quantitySold: 100 }],
    });
    const html = renderProductCard(reuben, c, { style: "vape" });
    expect(html).toContain("Trending");
  });

  it("NEVER renders a rating or review count when there is no real per-item aggregate", () => {
    const html = renderProductCard(reuben, ctx(), { style: "deli" });
    expect(html).not.toContain("★");
    expect(html).not.toMatch(/\(\d+\)/); // no "(42)" review-count
  });

  it("renders a real rating + count only when productStats carries one", () => {
    const c = ctx({ productStats: { "The Reuben": { rating: 4.6, reviewCount: 42 } } });
    const html = renderProductCard(reuben, c, { style: "deli" });
    expect(html).toContain("★");
    expect(html).toContain("(42)");
  });

  it("links Quick Add to the tenant's real ordering URL", () => {
    const html = renderProductCard(reuben, ctx(), { style: "deli" });
    expect(html).toContain('href="http://localhost:3000/order/r1"');
  });
});
