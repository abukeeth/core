import { describe, expect, it } from "vitest";
import { scoreConversion } from "./conversion-score";
import type { SiteDefinition } from "../types";

function completeDefinition(): SiteDefinition {
  return {
    schemaVersion: 1,
    restaurantName: "Trattoria Bella",
    tagline: "Handmade pasta, done right",
    cuisine: "italian",
    businessType: "bistro",
    styleFamily: "MODERN",
    themeKey: "modern-bistro",
    themeVersion: 1,
    colorSeed: "#e8590c",
    typography: { display: "Sora", body: "Inter" },
    facts: { restaurantName: "Trattoria Bella", address: "123 Main St", phone: "555-0100", hasOnlineOrdering: true, hasReservations: false },
    pages: [
      {
        slug: "/",
        title: "Home — Trattoria Bella | Italian",
        metaDescription: "Handmade pasta and Italian classics, made fresh every day.",
        sections: [
          { type: "hero", props: { ctaLabel: "Order Now" } },
          { type: "hoursLocation", props: { address: "123 Main St", phone: "555-0100" } },
          { type: "footer", props: {} },
        ],
      },
      {
        slug: "/contact",
        title: "Contact — Trattoria Bella | Italian",
        metaDescription: "Get in touch with Trattoria Bella.",
        sections: [{ type: "contactInfo", props: { address: "123 Main St", phone: "555-0100" } }, { type: "footer", props: {} }],
      },
    ],
  };
}

describe("scoreConversion", () => {
  it("gives a complete site a perfect score", () => {
    const result = scoreConversion(completeDefinition());
    expect(result.score).toBe(100);
    expect(result.suggestions).toHaveLength(0);
  });

  it("penalizes a hero with no CTA", () => {
    const def = completeDefinition();
    def.pages[0].sections[0] = { type: "hero", props: {} };
    const result = scoreConversion(def);
    expect(result.suggestions.some((s) => s.id.includes("cta-above-fold"))).toBe(true);
    expect(result.score).toBeLessThan(100);
  });

  it("penalizes a home page with no hours/location", () => {
    const def = completeDefinition();
    def.pages[0].sections = def.pages[0].sections.filter((s) => s.type !== "hoursLocation");
    const result = scoreConversion(def);
    expect(result.suggestions.some((s) => s.id.includes("hours-location"))).toBe(true);
  });

  it("penalizes a missing click-to-call phone number", () => {
    const def = completeDefinition();
    const contactPage = def.pages.find((p) => p.slug === "/contact")!;
    contactPage.sections = [{ type: "contactInfo", props: { address: "123 Main St" } }, { type: "footer", props: {} }];
    const result = scoreConversion(def);
    expect(result.suggestions.some((s) => s.id.includes("click-to-call"))).toBe(true);
  });
});
