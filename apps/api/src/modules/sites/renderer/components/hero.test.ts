import { describe, expect, it } from "vitest";
import { renderHero } from "./hero";
import type { RenderContext } from "../render-context";
import type { SiteDefinition } from "../../types";

function ctx(overrides: Partial<RenderContext["assets"]> = {}): RenderContext {
  return {
    siteId: "site-1",
    restaurantId: "restaurant-1",
    orderingBaseUrl: "http://localhost:3000",
    bestSellers: [],
    activeOffers: [],
    loyaltyProgram: null,
    definition: { tagline: "Handmade pasta", restaurantName: "Trattoria Bella" } as SiteDefinition,
    liveMenu: [],
    assets: { galleryImages: [], ...overrides },
  };
}

describe("renderHero", () => {
  it("renders the minimal-typographic variant with no image", () => {
    const html = renderHero({ type: "hero", variant: "minimal-typographic", props: { headline: "Welcome", ctaLabel: "View Menu" } }, ctx());
    expect(html).toContain("Welcome");
    expect(html).not.toContain("<img");
  });

  it("renders a full-bleed image hero when a hero image and a photo-based variant are both present", () => {
    const html = renderHero(
      { type: "hero", variant: "fullbleed-image", props: { headline: "Welcome", ctaLabel: "Order Now" } },
      ctx({ heroUrl: "/assets/hero.png", heroAlt: "The dining room" }),
    );
    expect(html).toContain('<img src="/assets/hero.png"');
    expect(html).toContain("The dining room");
  });

  it("falls back to typographic even with a hero image if the variant is minimal-typographic", () => {
    const html = renderHero(
      { type: "hero", variant: "minimal-typographic", props: { headline: "Welcome" } },
      ctx({ heroUrl: "/assets/hero.png" }),
    );
    expect(html).not.toContain("<img");
  });

  it("applies the given scrim opacity to the overlay", () => {
    const html = renderHero(
      { type: "hero", variant: "fullbleed-image", props: { headline: "Welcome", scrimOpacity: 0.7 } },
      ctx({ heroUrl: "/assets/hero.png" }),
    );
    expect(html).toContain("rgba(0,0,0,0.7)");
  });

  it("escapes the CTA label", () => {
    const html = renderHero({ type: "hero", props: { headline: "Welcome", ctaLabel: "<script>alert(1)</script>" } }, ctx());
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});
