import { describe, expect, it } from "vitest";
import type { RenderContext } from "../render-context";
import type { SiteDefinition } from "../../types";
import { renderFeaturedProducts } from "./featured-products";

function ctx(items: { name: string; priceCents: number; isAvailable: boolean; imageUrl?: string }[]): RenderContext {
  return {
    siteId: "s",
    restaurantId: "r",
    orderingBaseUrl: "https://app.example.com",
    bestSellers: [],
    activeOffers: [],
    loyaltyProgram: null,
    definition: { themeKey: "vape-vapor", restaurantName: "Cloud Nine" } as SiteDefinition,
    liveMenu: [{ name: "Disposables", items }],
    assets: { galleryImages: [] },
  } as unknown as RenderContext;
}

const section = { type: "featuredProducts" as const, props: {} };

describe("renderFeaturedProducts — Sprint 5.5 non-food product tiles", () => {
  it("uses the premium monogram tile (never a food-plate placeholder) when a product has no image", () => {
    const html = renderFeaturedProducts(section, ctx([{ name: "Pulse Disposable", priceCents: 2499, isAvailable: true }]));
    // premium image-less tile is an inline role=img SVG monogram...
    expect(html).toContain('role="img"');
    expect(html).toContain("Pulse Disposable");
    // ...and never the food-dish data-URI placeholder.
    expect(html).not.toContain("data:image/svg+xml");
  });

  it("preserves a real imported product photo when present", () => {
    const html = renderFeaturedProducts(section, ctx([{ name: "Pulse Disposable", priceCents: 2499, isAvailable: true, imageUrl: "/uploads/real.png" }]));
    expect(html).toContain('<img src="/uploads/real.png"');
  });
});
