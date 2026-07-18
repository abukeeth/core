import { describe, expect, it } from "vitest";
import { renderGallery } from "./gallery";
import type { RenderContext } from "../render-context";
import type { SiteDefinition } from "../../types";

function ctx(galleryImages: RenderContext["assets"]["galleryImages"]): RenderContext {
  return {
    siteId: "site-1",
    restaurantId: "restaurant-1",
    orderingBaseUrl: "http://localhost:3000",
    bestSellers: [],
    activeOffers: [],
    loyaltyProgram: null,
    definition: { restaurantName: "Trattoria Bella", cuisine: "italian", businessType: "bistro" } as SiteDefinition,
    liveMenu: [],
    assets: { galleryImages },
  };
}

describe("renderGallery", () => {
  it("Theme Engine V2: renders curated cuisine-matched stock imagery (never empty) when there are no uploaded gallery images", () => {
    const html = renderGallery({ type: "gallery", props: {} }, ctx([]));
    expect(html).toContain('<section class="gallery">');
    // Real stock photos, layered over the always-present generated gradient fallback.
    expect(html).toContain("images.unsplash.com");
    expect(html).toContain("linear-gradient(");
    // Six curated tiles for a business with no uploads.
    expect(html.match(/role="img"/g)?.length).toBe(6);
  });

  it("renders an image tile per gallery image", () => {
    const html = renderGallery(
      { type: "gallery", props: {} },
      ctx([
        { url: "/assets/g1.png", alt: "Dining room" },
        { url: "/assets/g2.png", alt: "Patio" },
      ]),
    );
    expect(html).toContain("/assets/g1.png");
    expect(html).toContain("/assets/g2.png");
    expect(html).toContain("Dining room");
  });

  it("escapes alt text", () => {
    const html = renderGallery({ type: "gallery", props: {} }, ctx([{ url: "/assets/g1.png", alt: '"><script>alert(1)</script>' }]));
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
