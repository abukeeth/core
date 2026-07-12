import { describe, expect, it } from "vitest";
import { renderMenuSection } from "./menu-section";
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

describe("renderMenuSection", () => {
  it("renders from ctx.liveMenu, not from the section's own (possibly stale) props", () => {
    const html = renderMenuSection(
      { type: "menu", props: { categories: [{ name: "STALE-CATEGORY", items: [{ name: "Stale Item", priceCents: 999 }] }] } },
      ctx([{ name: "Mains", items: [{ name: "Spaghetti", priceCents: 1500, isAvailable: true }] }]),
    );
    expect(html).toContain("Spaghetti");
    expect(html).toContain("$15.00");
    expect(html).not.toContain("STALE-CATEGORY");
    expect(html).not.toContain("Stale Item");
  });

  it("excludes unavailable items", () => {
    const html = renderMenuSection({ type: "menu", props: {} }, ctx([
      { name: "Mains", items: [{ name: "Spaghetti", priceCents: 1500, isAvailable: true }, { name: "86'd", priceCents: 999, isAvailable: false }] },
    ]));
    expect(html).toContain("Spaghetti");
    expect(html).not.toContain("86'd");
  });

  it("shows a friendly placeholder when there are no available items at all", () => {
    const html = renderMenuSection({ type: "menu", props: {} }, ctx([]));
    expect(html).toContain("Menu coming soon");
  });

  it("reflects a price change immediately (this is the live-data contract, not a snapshot)", () => {
    const before = renderMenuSection({ type: "menu", props: {} }, ctx([{ name: "Mains", items: [{ name: "Spaghetti", priceCents: 1500, isAvailable: true }] }]));
    const after = renderMenuSection({ type: "menu", props: {} }, ctx([{ name: "Mains", items: [{ name: "Spaghetti", priceCents: 1800, isAvailable: true }] }]));
    expect(before).toContain("$15.00");
    expect(after).toContain("$18.00");
  });

  it("escapes item names/descriptions", () => {
    const html = renderMenuSection({ type: "menu", props: {} }, ctx([
      { name: "Mains", items: [{ name: "<script>x</script>", description: "<img onerror=alert(1)>", priceCents: 100, isAvailable: true }] },
    ]));
    expect(html).not.toContain("<script>x</script>");
    expect(html).not.toContain("<img onerror=alert(1)>");
  });
});
