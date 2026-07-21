import { describe, expect, it } from "vitest";
import { renderFeatures } from "./features";
import type { RenderContext } from "../render-context";
import type { SiteDefinition } from "../../types";

function ctx(restaurantName: string): RenderContext {
  return {
    siteId: "s1",
    restaurantId: "r1",
    orderingBaseUrl: "http://localhost:3000",
    bestSellers: [],
    activeOffers: [],
    loyaltyProgram: null,
    definition: { restaurantName } as SiteDefinition,
    liveMenu: [],
    assets: { galleryImages: [] },
  };
}

const section = { type: "features" as const, props: {} };

describe("renderFeatures — Sprint 5 · T5 marketing band", () => {
  it("renders a 'Why choose {business}' band with the benefit features and trust badges", () => {
    const html = renderFeatures(section, ctx("Joe's Deli"));
    expect(html).toContain("Why choose Joe&#39;s Deli");
    expect(html).toContain("Order Online");
    expect(html).toContain("Fast Pickup");
    expect(html).toContain("Secure Checkout");
    expect(html).toContain("Locally Owned");
    expect(html).toContain("Secure Payments"); // a trust badge
  });

  it("uses self-contained inline SVG icons and no external hotlinks", () => {
    const html = renderFeatures(section, ctx("Cafe"));
    expect(html).toContain("<svg");
    expect(html).not.toContain("http");
    expect(html).not.toContain("<img");
  });

  it("is accessible (labelled section heading) and themed via CSS custom properties", () => {
    const html = renderFeatures(section, ctx("Cafe"));
    expect(html).toContain('aria-labelledby="feat-title"');
    expect(html).toContain('id="feat-title"');
    expect(html).toContain("var(--color-accent-600)");
  });

  it("escapes the business name", () => {
    const html = renderFeatures(section, ctx("<script>x</script>"));
    expect(html).not.toContain("<script>x</script>");
  });
});
