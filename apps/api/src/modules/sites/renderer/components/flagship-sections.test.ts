import { describe, expect, it } from "vitest";
import { renderComboDeals } from "./combo-deals";
import { renderProductCollection } from "./product-collection";
import { renderFeaturedBrands } from "./featured-brands";
import { renderStoreLocations } from "./store-locations";
import { renderCatering } from "./catering";
import { renderBuildYourOwn } from "./build-your-own";
import { renderLoyalty } from "./loyalty";
import type { RenderContext } from "../render-context";
import type { SectionBlock } from "../../types";

function ctx(themeKey = "deli-brooklyn", overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    siteId: "s1",
    restaurantId: "r1",
    orderingBaseUrl: "http://localhost:3000",
    bestSellers: [],
    activeOffers: [],
    loyaltyProgram: null,
    definition: { themeKey, restaurantName: "Test Co" } as RenderContext["definition"],
    liveMenu: [],
    assets: { galleryImages: [] },
    ...overrides,
  } as RenderContext;
}
const block = (props: Record<string, unknown>): SectionBlock => ({ type: "catering", props });

describe("comboDeals", () => {
  it("self-omits with fewer than two items", () => {
    expect(renderComboDeals(block({ items: [{ name: "A", priceCents: 100 }] }), ctx())).toBe("");
    expect(renderComboDeals(block({ items: [] }), ctx())).toBe("");
  });
  it("pairs real items with their real prices and never invents a bundle price", () => {
    const html = renderComboDeals(block({ items: [{ name: "Reuben", priceCents: 1450 }, { name: "Chips", priceCents: 400 }] }), ctx());
    expect(html).toContain("Reuben");
    expect(html).toContain("$14.50");
    expect(html).toContain("Chips");
    expect(html).toContain("$4.00");
    // Only the two real prices appear — no third "bundle" total.
    expect(html.match(/\$\d+\.\d{2}/g)).toEqual(["$14.50", "$4.00"]);
  });
});

describe("productCollection", () => {
  it("self-omits with no items", () => {
    expect(renderProductCollection(block({ title: "Devices", items: [] }), ctx("vape-lab"))).toBe("");
  });
  it("renders the real items under the category title", () => {
    const html = renderProductCollection(block({ title: "Devices", items: [{ name: "Pod X2", priceCents: 3499 }] }), ctx("vape-lab"));
    expect(html).toContain("Devices");
    expect(html).toContain("Pod X2");
    expect(html).toContain("$34.99");
  });
});

describe("featuredBrands", () => {
  it("self-omits with no categories", () => {
    expect(renderFeaturedBrands(block({ categories: [] }), ctx("vape-lab"))).toBe("");
  });
  it("renders the tenant's REAL categories (not fabricated brand names)", () => {
    const html = renderFeaturedBrands(block({ categories: ["Devices", "E-Liquids"] }), ctx("vape-lab"));
    expect(html).toContain("Devices");
    expect(html).toContain("E-Liquids");
  });
});

describe("storeLocations", () => {
  it("self-omits without a real address", () => {
    expect(renderStoreLocations(block({ address: "" }), ctx("vape-lab"))).toBe("");
  });
  it("renders the one real address with a Directions link", () => {
    const html = renderStoreLocations(block({ address: "88 Market St", phone: "555-0140" }), ctx("vape-lab"));
    expect(html).toContain("88 Market St");
    expect(html).toContain("google.com/maps");
    expect(html).toContain("tel:5550140");
  });
});

describe("catering + buildYourOwn (generic honest bands)", () => {
  it("catering prefers a tel: CTA when a real phone exists", () => {
    expect(renderCatering(block({ phone: "555-0110" }), ctx())).toContain("tel:5550110");
    expect(renderCatering(block({}), ctx())).toContain("/order/r1");
  });
  it("buildYourOwn renders the steps band", () => {
    const html = renderBuildYourOwn(block({}), ctx());
    expect(html).toContain("Build your own");
    expect(html).toContain("/order/r1");
  });
});

describe("loyalty — vape flagship dark panel is readable, and still real-data-gated", () => {
  it("renders nothing when there is no active program", () => {
    expect(renderLoyalty(block({}), ctx("vape-lab", { loyaltyProgram: null }))).toBe("");
  });
  it("uses a light-on-dark rewards panel for vape-lab (white heading, not the light primary-50 band)", () => {
    const c = ctx("vape-lab", { loyaltyProgram: { isActive: true, pointsPerDollarCents: 1, redemptionRateCentsPerPoint: 5 } });
    const html = renderLoyalty(block({}), c);
    expect(html).toContain("color:#fff");
    expect(html).not.toContain("var(--color-primary-50)");
  });
});
