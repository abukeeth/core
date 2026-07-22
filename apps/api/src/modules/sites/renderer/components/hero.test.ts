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

  it("§Website Builder: shows a real hero photo as a restrained inset image even for minimal-typographic, never discarding it", () => {
    const html = renderHero(
      { type: "hero", variant: "minimal-typographic", props: { headline: "Welcome" } },
      ctx({ heroUrl: "/assets/hero.png" }),
    );
    // Text-forward identity preserved (no full-bleed background-image layer)...
    expect(html).not.toContain("width:100%;height:");
    // ...but the real uploaded photo is still shown, just smaller/inset.
    expect(html).toContain('<img src="/assets/hero.png"');
    expect(html).toContain("max-width:280px");
  });

  it("applies the given scrim opacity to the overlay", () => {
    const html = renderHero(
      { type: "hero", variant: "fullbleed-image", props: { headline: "Welcome", scrimOpacity: 0.7 } },
      ctx({ heroUrl: "/assets/hero.png" }),
    );
    // Cinematic bottom-weighted scrim carries the chosen opacity at its base.
    expect(html).toContain("linear-gradient(180deg");
    expect(html).toContain("rgba(6,4,3,0.7)");
  });

  it("escapes the CTA label", () => {
    const html = renderHero({ type: "hero", props: { headline: "Welcome", ctaLabel: "<script>alert(1)</script>" } }, ctx());
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("§Website Builder: never renders a blank full-bleed hero — a fallback tile appears when there's no uploaded photo", () => {
    const html = renderHero({ type: "hero", variant: "fullbleed-image", props: { headline: "Welcome" } }, ctx());
    expect(html).not.toContain("<img");
    expect(html).toContain("linear-gradient");
  });

  it("§Website Builder: bold-block leads with a heavier scrim and an uppercase headline for a punchier statement", () => {
    const html = renderHero({ type: "hero", variant: "bold-block", props: { headline: "Welcome" } }, ctx({ heroUrl: "/assets/hero.png" }));
    expect(html).toContain('<img src="/assets/hero.png"');
    expect(html).toContain("text-transform:uppercase");
    // Heavier bottom scrim + a dramatic display-scale headline.
    expect(html).toContain("rgba(6,4,3,0.62)");
    expect(html).toContain("font-size:var(--step-4)");
  });

  it("§Website Builder: bold-block still shows a fallback tile (not blank) with no uploaded photo", () => {
    const html = renderHero({ type: "hero", variant: "bold-block", props: { headline: "Welcome" } }, ctx());
    expect(html).not.toContain("<img");
    expect(html).toContain("linear-gradient");
  });

  it("§Website Builder: editorial-split leads with a larger inset image ahead of the text, asymmetric magazine-style", () => {
    const html = renderHero(
      { type: "hero", variant: "editorial-split", props: { headline: "Welcome" } },
      ctx({ heroUrl: "/assets/hero.png" }),
    );
    const imgIndex = html.indexOf("<img");
    const textIndex = html.indexOf("Welcome");
    expect(imgIndex).toBeGreaterThan(-1);
    expect(imgIndex).toBeLessThan(textIndex);
    expect(html).toContain("max-width:560px");
  });

  it("§Website Builder: warm-frame centers a framed photo above centered text", () => {
    const html = renderHero({ type: "hero", variant: "warm-frame", props: { headline: "Welcome" } }, ctx({ heroUrl: "/assets/hero.png" }));
    expect(html).toContain("border:8px solid var(--color-surface-50);");
    expect(html).toContain("flex-direction:column;align-items:center;text-align:center;");
  });

  it("§Website Builder: warm-frame shows a framed fallback tile (not blank) with no uploaded photo", () => {
    const html = renderHero({ type: "hero", variant: "warm-frame", props: { headline: "Welcome" } }, ctx());
    expect(html).not.toContain("<img");
    expect(html).toContain("border:8px solid var(--color-surface-50);");
  });
});
