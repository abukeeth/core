import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLoggerWarn } = vi.hoisted(() => ({ mockLoggerWarn: vi.fn() }));
vi.mock("../../../lib/logger", () => ({ createLogger: () => ({ warn: mockLoggerWarn }) }));

import { renderSections } from "./layout-engine";
import type { RenderContext } from "./render-context";
import type { SectionBlock } from "../types";

function ctx(overrides: Partial<RenderContext> = {}): RenderContext {
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
      tagline: "Handmade pasta",
      cuisine: "italian",
      businessType: "bistro",
      styleFamily: "MODERN",
      themeKey: "modern-bistro",
      themeVersion: 1,
      colorSeed: "#e8590c",
      typography: { display: "Sora", body: "Inter" },
      facts: { restaurantName: "Trattoria Bella", hasOnlineOrdering: false, hasReservations: false },
      pages: [],
    },
    liveMenu: [],
    assets: { galleryImages: [] },
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("renderSections", () => {
  it("renders a known section type", () => {
    const sections: SectionBlock[] = [{ type: "footer", props: {} }];
    const html = renderSections(sections, ctx());
    expect(html).toContain("Trattoria Bella");
  });

  it("skips an unknown/unregistered section type without throwing", () => {
    const sections: SectionBlock[] = [
      { type: "testimonials", props: {} },
      { type: "footer", props: {} },
    ];
    expect(() => renderSections(sections, ctx())).not.toThrow();
  });

  it("logs a warning when skipping an unregistered section type", () => {
    mockLoggerWarn.mockClear();
    renderSections([{ type: "testimonials", props: {} }], ctx());
    expect(mockLoggerWarn).toHaveBeenCalledWith({ sectionType: "testimonials" }, expect.stringContaining("testimonials"));
  });

  it("omits empty renders (e.g. gallery with zero images) from the output entirely", () => {
    const html = renderSections([{ type: "gallery", props: {} }], ctx());
    expect(html.trim()).toBe("");
  });

  it("preserves section order in the rendered output", () => {
    const sections: SectionBlock[] = [
      { type: "hero", props: { headline: "FIRST-MARKER" } },
      { type: "footer", props: {} },
    ];
    const html = renderSections(sections, ctx());
    expect(html.indexOf("FIRST-MARKER")).toBeLessThan(html.indexOf("<footer"));
  });
});
