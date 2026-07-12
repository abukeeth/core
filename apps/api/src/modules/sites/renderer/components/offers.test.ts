import { describe, expect, it } from "vitest";
import { renderOffers } from "./offers";
import type { RenderContext } from "../render-context";
import type { SiteDefinition } from "../../types";

function ctx(activeOffers: RenderContext["activeOffers"]): RenderContext {
  return {
    siteId: "site-1",
    restaurantId: "restaurant-1",
    orderingBaseUrl: "http://localhost:3000",
    bestSellers: [],
    activeOffers,
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

describe("renderOffers", () => {
  it("renders nothing when there are no currently-active coupons", () => {
    expect(renderOffers({ type: "offers", props: {} }, ctx([]))).toBe("");
  });

  it("describes a percentage-off coupon in plain language and shows the real code", () => {
    const html = renderOffers(
      { type: "offers", props: {} },
      ctx([{ code: "SAVE20", type: "PERCENTAGE", value: 2000, minOrderCents: null, expiresAt: null }]),
    );
    expect(html).toContain("20% off");
    expect(html).toContain("SAVE20");
  });

  it("describes a fixed-amount coupon with its minimum order", () => {
    const html = renderOffers(
      { type: "offers", props: {} },
      ctx([{ code: "FIVEOFF", type: "FIXED_AMOUNT", value: 500, minOrderCents: 2000, expiresAt: null }]),
    );
    expect(html).toContain("$5.00 off");
    expect(html).toContain("$20.00");
  });

  it("describes a free-delivery coupon", () => {
    const html = renderOffers({ type: "offers", props: {} }, ctx([{ code: "FREESHIP", type: "FREE_DELIVERY", value: 0, minOrderCents: null, expiresAt: null }]));
    expect(html).toContain("Free delivery");
  });
});
