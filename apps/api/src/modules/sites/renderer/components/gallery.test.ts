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
    definition: { restaurantName: "Trattoria Bella" } as SiteDefinition,
    liveMenu: [],
    assets: { galleryImages },
  };
}

describe("renderGallery", () => {
  it("renders nothing at all when there are no gallery images", () => {
    expect(renderGallery({ type: "gallery", props: {} }, ctx([]))).toBe("");
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
