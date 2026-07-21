import { describe, expect, it } from "vitest";
import { renderAgeGate } from "./age-gate";
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

const section = { type: "ageGate" as const, props: {} };

describe("renderAgeGate — Sprint 5 age verification (21+)", () => {
  it("renders a blocking, accessible 21+ dialog with confirm/deny controls", () => {
    const html = renderAgeGate(section, ctx("Easy Tobacco Shop"));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("Are you 21 or older?");
    expect(html).toContain('id="ov-age-yes"');
    expect(html).toContain('id="ov-age-no"');
    expect(html).toContain("Easy Tobacco Shop");
    // Fixed, top-layer overlay so it blocks regardless of section order.
    expect(html).toContain("position:fixed");
  });

  it("ships a self-contained inline confirm script and no external hotlinks", () => {
    const html = renderAgeGate(section, ctx("Vapor"));
    expect(html).toContain("<script>");
    expect(html).toContain("localStorage");
    expect(html).not.toContain("http://");
    expect(html).not.toContain("https://");
    expect(html).not.toContain("<img");
  });

  it("escapes the business name", () => {
    const html = renderAgeGate(section, ctx("<script>x</script>"));
    expect(html).not.toContain("<script>x</script>");
  });
});
