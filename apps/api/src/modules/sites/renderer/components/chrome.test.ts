import { describe, expect, it } from "vitest";
import { renderHeaderNav, renderMobileActionBar } from "./chrome";
import type { RenderContext } from "../render-context";
import type { SiteDefinition } from "../../types";

function definition(overrides: Partial<SiteDefinition["facts"]> = {}, family: SiteDefinition["styleFamily"] = "MODERN"): SiteDefinition {
  return {
    restaurantName: "Trattoria Bella",
    styleFamily: family,
    facts: { restaurantName: "Trattoria Bella", hasOnlineOrdering: false, hasReservations: false, ...overrides },
    pages: [
      { slug: "/", title: "Home", metaDescription: "x", sections: [] },
      { slug: "/menu", title: "Menu", metaDescription: "x", sections: [] },
    ],
  } as unknown as SiteDefinition;
}

function ctx(def: SiteDefinition): RenderContext {
  return { siteId: "site-1", restaurantId: "restaurant-1", orderingBaseUrl: "http://localhost:3000", bestSellers: [], activeOffers: [], loyaltyProgram: null, definition: def, liveMenu: [], assets: { galleryImages: [] } };
}

describe("renderHeaderNav", () => {
  it("links to every page in the definition", () => {
    const html = renderHeaderNav(ctx(definition()));
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/menu"');
  });

  it("escapes the restaurant name", () => {
    const def = definition();
    def.restaurantName = "<script>alert(1)</script>";
    const html = renderHeaderNav(ctx(def));
    expect(html).not.toContain("<script>alert(1)</script>");
  });
});

describe("renderMobileActionBar", () => {
  it("includes a Call link only when a phone number exists", () => {
    const withPhone = renderMobileActionBar(ctx(definition({ phone: "555-0100" })));
    const withoutPhone = renderMobileActionBar(ctx(definition()));
    expect(withPhone).toContain("tel:5550100");
    expect(withoutPhone).not.toContain("tel:");
  });

  it("includes a Directions link only when an address exists", () => {
    const withAddress = renderMobileActionBar(ctx(definition({ address: "123 Main St" })));
    const withoutAddress = renderMobileActionBar(ctx(definition()));
    expect(withAddress).toContain("google.com/maps");
    expect(withoutAddress).not.toContain("google.com/maps");
  });

  it("always includes the primary CTA action, computed per §3 CTA logic", () => {
    const ordering = renderMobileActionBar(ctx(definition({ hasOnlineOrdering: true })));
    const reservations = renderMobileActionBar(ctx(definition({ hasReservations: true })));
    const neither = renderMobileActionBar(ctx(definition()));

    expect(ordering).toContain("Order Now");
    expect(reservations).toContain("Book a Table");
    expect(neither).toContain("View Menu");
  });
});
