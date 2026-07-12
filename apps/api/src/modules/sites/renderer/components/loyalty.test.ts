import { describe, expect, it } from "vitest";
import { renderLoyalty } from "./loyalty";
import type { RenderContext } from "../render-context";
import type { SiteDefinition } from "../../types";

function ctx(loyaltyProgram: RenderContext["loyaltyProgram"]): RenderContext {
  return {
    siteId: "site-1",
    restaurantId: "restaurant-1",
    orderingBaseUrl: "http://localhost:3000",
    bestSellers: [],
    activeOffers: [],
    loyaltyProgram,
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

describe("renderLoyalty", () => {
  it("renders nothing when the owner has never enabled a loyalty program", () => {
    expect(renderLoyalty({ type: "loyalty", props: {} }, ctx(null))).toBe("");
  });

  it("renders nothing when the program exists but is disabled", () => {
    const html = renderLoyalty({ type: "loyalty", props: {} }, ctx({ isActive: false, pointsPerDollarCents: 10, redemptionRateCentsPerPoint: 1 }));
    expect(html).toBe("");
  });

  it("describes the real earn/redeem rates when the program is active", () => {
    const html = renderLoyalty({ type: "loyalty", props: {} }, ctx({ isActive: true, pointsPerDollarCents: 10, redemptionRateCentsPerPoint: 1 }));
    expect(html).toContain("Earn 10 points");
    expect(html).toContain("$0.01 off per point");
  });
});
