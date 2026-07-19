import { describe, expect, it } from "vitest";
import { renderServiceOptions } from "./service-options";
import type { RenderContext, ServiceAvailability } from "../render-context";
import type { SiteDefinition } from "../../types";

function ctx(services?: ServiceAvailability): RenderContext {
  return {
    siteId: "site-1",
    restaurantId: "restaurant-1",
    orderingBaseUrl: "http://localhost:3000",
    bestSellers: [],
    activeOffers: [],
    loyaltyProgram: null,
    definition: { restaurantName: "Maison" } as SiteDefinition,
    liveMenu: [],
    assets: { galleryImages: [] },
    services,
  };
}

const NONE: ServiceAvailability = { pickup: false, delivery: false, dineIn: false, reservations: false };

describe("renderServiceOptions", () => {
  it("omits the section entirely when the render context has no resolved services (e.g. a bare context)", () => {
    expect(renderServiceOptions({ type: "serviceOptions", props: {} }, ctx(undefined))).toBe("");
  });

  it("omits the section when the tenant has enabled no services (never fabricates availability)", () => {
    expect(renderServiceOptions({ type: "serviceOptions", props: {} }, ctx(NONE))).toBe("");
  });

  it("renders only the services the tenant has actually enabled", () => {
    const html = renderServiceOptions({ type: "serviceOptions", props: {} }, ctx({ ...NONE, pickup: true, delivery: true }));
    expect(html).toContain("Pickup");
    expect(html).toContain("Delivery");
    expect(html).not.toContain("Dine-in");
    expect(html).not.toContain("Reservations");
    // Order actions point at the real ordering app for this tenant.
    expect(html).toContain("http://localhost:3000/order/restaurant-1");
  });

  it("surfaces reservations and dine-in when those are the enabled services", () => {
    const html = renderServiceOptions({ type: "serviceOptions", props: {} }, ctx({ ...NONE, dineIn: true, reservations: true }));
    expect(html).toContain("Dine-in");
    expect(html).toContain("Reservations");
    expect(html).toContain('href="/contact"');
    expect(html).not.toContain("Pickup");
  });

  it("uses a semantic, labelled section for accessibility", () => {
    const html = renderServiceOptions({ type: "serviceOptions", props: {} }, ctx({ ...NONE, pickup: true }));
    expect(html).toContain('aria-labelledby="service-options-title"');
    expect(html).toContain('id="service-options-title"');
  });
});
