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

  it("§Website Builder: renders a real uploaded item photo when one exists", () => {
    const html = renderMenuSection({ type: "menu", props: {} }, ctx([
      { name: "Mains", items: [{ name: "Spaghetti", priceCents: 1500, isAvailable: true, imageUrl: "/assets/spaghetti.png" }] },
    ]));
    expect(html).toContain('<img src="/assets/spaghetti.png"');
  });

  it("§Website Builder: falls back to a polished non-photographic tile when an item has no uploaded photo", () => {
    const html = renderMenuSection({ type: "menu", props: {} }, ctx([
      { name: "Mains", items: [{ name: "Spaghetti", priceCents: 1500, isAvailable: true }] },
    ]));
    expect(html).not.toContain("<img");
    expect(html).toContain(">S<");
  });

  it("§Website Builder: renders a real uploaded category photo, or a fallback tile when there is none", () => {
    const withPhoto = renderMenuSection({ type: "menu", props: {} }, ctx([
      { name: "Mains", imageUrl: "/assets/mains.png", items: [{ name: "Spaghetti", priceCents: 1500, isAvailable: true }] },
    ]));
    expect(withPhoto).toContain('<img src="/assets/mains.png"');

    const withoutPhoto = renderMenuSection({ type: "menu", props: {} }, ctx([
      { name: "Mains", items: [{ name: "Spaghetti", priceCents: 1500, isAvailable: true }] },
    ]));
    expect(withoutPhoto).toContain(">M<");
  });
});

describe("renderMenuSection — §Website Builder design-system category layouts", () => {
  // Sprint 5 · T1 — these tests assert how each *photo-forward* variant renders,
  // so the item carries an image (100% coverage). Below the coverage threshold a
  // photo grid is intentionally re-routed to the typographic menu (see the
  // "Coverage-Aware Layout" block); that behaviour is tested there, not here.
  const menu: RenderContext["liveMenu"] = [
    { name: "Mains", items: [{ name: "Spaghetti", description: "Handmade pasta", priceCents: 1500, isAvailable: true, imageUrl: "/assets/spaghetti.png" }] },
  ];

  it("editorial-rows: renders a full-width alternating row layout with no card boxes", () => {
    const html = renderMenuSection({ type: "menu", variant: "editorial-rows", props: {} }, ctx(menu));
    expect(html).toContain("Spaghetti");
    expect(html).toContain("$15.00");
    expect(html).not.toContain('style="list-style:none;background:var(--color-surface-100)');
  });

  it("warm-cards: renders items as a grid of soft rounded cards", () => {
    const html = renderMenuSection({ type: "menu", variant: "warm-cards", props: {} }, ctx(menu));
    expect(html).toContain("Spaghetti");
    expect(html).toContain("border-radius:var(--radius);box-shadow:var(--shadow)");
  });

  it("bold-grid: renders a dense hard-edged grid with the price in a solid badge", () => {
    const html = renderMenuSection({ type: "menu", variant: "bold-grid", props: {} }, ctx(menu));
    expect(html).toContain("Spaghetti");
    expect(html).toContain("border:2px solid var(--color-surface-900)");
    expect(html).toContain("background:var(--color-primary-600);color:#fff;font-weight:800;");
  });

  it("the three design-system layouts render materially different markup for the same data", () => {
    const editorial = renderMenuSection({ type: "menu", variant: "editorial-rows", props: {} }, ctx(menu));
    const warm = renderMenuSection({ type: "menu", variant: "warm-cards", props: {} }, ctx(menu));
    const bold = renderMenuSection({ type: "menu", variant: "bold-grid", props: {} }, ctx(menu));
    const classic = renderMenuSection({ type: "menu", props: {} }, ctx(menu));

    expect(new Set([editorial, warm, bold, classic]).size).toBe(4);
  });

  it("escapes item names/descriptions across every design-system layout", () => {
    const dangerous: RenderContext["liveMenu"] = [
      { name: "Mains", items: [{ name: "<script>x</script>", description: "<img onerror=alert(1)>", priceCents: 100, isAvailable: true }] },
    ];
    for (const variant of ["editorial-rows", "warm-cards", "bold-grid"] as const) {
      const html = renderMenuSection({ type: "menu", variant, props: {} }, ctx(dangerous));
      expect(html).not.toContain("<script>x</script>");
      expect(html).not.toContain("<img onerror=alert(1)>");
    }
  });
});

describe("renderMenuSection — Sprint 5 · T1 Coverage-Aware Layout", () => {
  /** One category of `total` items, the first `withImage` of which carry a photo. */
  function menuWithCoverage(total: number, withImage: number): RenderContext["liveMenu"] {
    return [
      {
        name: "Mains",
        items: Array.from({ length: total }, (_, i) => ({
          name: `Item ${i}`,
          priceCents: 100,
          isAvailable: true,
          imageUrl: i < withImage ? `/assets/item-${i}.png` : undefined,
        })),
      },
    ];
  }

  // Distinctive markup markers for each layout.
  const EDITORIAL = "À la carte"; // renderEditorialMenu eyebrow (typographic)
  const WARM_CARD = "box-shadow:var(--shadow)"; // renderWarmCards card box
  const BOLD_CELL = "border:2px solid var(--color-surface-900)"; // renderBoldGrid cell

  it("0% coverage: a photo-forward grid renders the premium typographic menu", () => {
    const html = renderMenuSection({ type: "menu", variant: "warm-cards", props: {} }, ctx(menuWithCoverage(4, 0)));
    expect(html).toContain(EDITORIAL);
    expect(html).not.toContain(WARM_CARD);
  });

  it("20% coverage: still below threshold → typographic", () => {
    const html = renderMenuSection({ type: "menu", variant: "bold-grid", props: {} }, ctx(menuWithCoverage(5, 1)));
    expect(html).toContain(EDITORIAL);
    expect(html).not.toContain(BOLD_CELL);
  });

  it("50% coverage: at/above threshold → the theme's photo grid is kept", () => {
    const html = renderMenuSection({ type: "menu", variant: "warm-cards", props: {} }, ctx(menuWithCoverage(2, 1)));
    expect(html).toContain(WARM_CARD);
    expect(html).not.toContain(EDITORIAL);
  });

  it("100% coverage: the theme's photo grid is kept", () => {
    const html = renderMenuSection({ type: "menu", variant: "bold-grid", props: {} }, ctx(menuWithCoverage(3, 3)));
    expect(html).toContain(BOLD_CELL);
    expect(html).not.toContain(EDITORIAL);
  });

  it("an already-typographic variant is unaffected by coverage", () => {
    const html = renderMenuSection({ type: "menu", variant: "editorial-menu", props: {} }, ctx(menuWithCoverage(4, 4)));
    expect(html).toContain(EDITORIAL);
  });

  it("the default (undefined) layout is never re-routed, preserving legacy output", () => {
    const html = renderMenuSection({ type: "menu", props: {} }, ctx(menuWithCoverage(4, 0)));
    expect(html).not.toContain(EDITORIAL);
  });
});
