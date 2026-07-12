import { describe, expect, it } from "vitest";
import { brandProfileSchema, siteDefinitionSchema } from "./types";

function validDefinition() {
  return {
    schemaVersion: 1 as const,
    restaurantName: "Trattoria Bella",
    tagline: "Handmade pasta, done right",
    cuisine: "Italian",
    businessType: "bistro",
    styleFamily: "MODERN" as const,
    themeKey: "modern-bistro",
    themeVersion: 1,
    colorSeed: "#8b2f2f",
    typography: { display: "Fraunces", body: "Inter" },
    facts: {
      restaurantName: "Trattoria Bella",
      address: "123 Main St",
      phone: "555-0100",
      hasOnlineOrdering: true,
      hasReservations: false,
    },
    pages: [
      {
        slug: "/" as const,
        title: "Trattoria Bella — Italian in Springfield",
        metaDescription: "Handmade pasta and Italian classics in Springfield.",
        sections: [
          { type: "hero" as const, variant: "split", props: { headline: "Handmade pasta, done right" } },
          { type: "footer" as const, props: {} },
        ],
      },
    ],
  };
}

describe("siteDefinitionSchema", () => {
  it("accepts a well-formed definition", () => {
    expect(siteDefinitionSchema.safeParse(validDefinition()).success).toBe(true);
  });

  it("rejects a page with zero sections", () => {
    const def = validDefinition();
    def.pages[0].sections = [];
    expect(siteDefinitionSchema.safeParse(def).success).toBe(false);
  });

  it("rejects an unknown section type", () => {
    const def = validDefinition();
    // @ts-expect-error deliberately invalid for the test
    def.pages[0].sections.push({ type: "notARealSection", props: {} });
    expect(siteDefinitionSchema.safeParse(def).success).toBe(false);
  });

  it("rejects a colorSeed that isn't a hex color", () => {
    const def = validDefinition();
    def.colorSeed = "papayawhip";
    expect(siteDefinitionSchema.safeParse(def).success).toBe(false);
  });

  it("rejects a meta description over 160 characters", () => {
    const def = validDefinition();
    def.pages[0].metaDescription = "x".repeat(161);
    expect(siteDefinitionSchema.safeParse(def).success).toBe(false);
  });

  it("rejects an empty restaurant name", () => {
    const def = validDefinition();
    def.restaurantName = "";
    expect(siteDefinitionSchema.safeParse(def).success).toBe(false);
  });
});

describe("brandProfileSchema", () => {
  const validProfile = {
    cuisine: "Italian",
    businessType: "bistro",
    priceTier: 2,
    personality: {
      traditionalContemporary: 0.6,
      casualFormal: 0.4,
      playfulSerious: 0.5,
      understatedBold: 0.3,
      rusticPolished: 0.5,
    },
    signalsUsed: ["menu language", "price points"],
    confidence: { cuisine: 0.9, businessType: 0.8, priceTier: 0.7, personality: 0.75 },
  };

  it("accepts a well-formed brand profile", () => {
    expect(brandProfileSchema.safeParse(validProfile).success).toBe(true);
  });

  it("rejects a personality axis outside 0-1", () => {
    const bad = { ...validProfile, personality: { ...validProfile.personality, casualFormal: 1.5 } };
    expect(brandProfileSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a priceTier outside 1-4", () => {
    const bad = { ...validProfile, priceTier: 5 };
    expect(brandProfileSchema.safeParse(bad).success).toBe(false);
  });
});
