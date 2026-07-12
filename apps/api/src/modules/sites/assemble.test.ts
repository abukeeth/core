import { describe, expect, it } from "vitest";
import { buildSiteDefinition } from "./assemble";
import { THEME_CATALOG } from "./theme-catalog";
import { siteDefinitionSchema, type BrandProfile, type ContentCore, type IngestData } from "./types";

const ingest: IngestData = {
  restaurantId: "r1",
  restaurantName: "Trattoria Bella",
  description: "A family-run Italian kitchen.",
  address: "123 Main St, Springfield, IL 62704",
  phone: "555-0100",
  menu: [
    { categoryName: "Mains", name: "Spaghetti Carbonara", description: "Classic Roman pasta", priceCents: 1800 },
    { categoryName: "Mains", name: "Lasagna", priceCents: 2000 },
    { categoryName: "Desserts", name: "Tiramisu", priceCents: 900 },
  ],
  photoCount: 4,
};

const brandProfile: BrandProfile = {
  cuisine: "italian",
  businessType: "bistro",
  priceTier: 3,
  personality: {
    traditionalContemporary: 0.5,
    casualFormal: 0.6,
    playfulSerious: 0.5,
    understatedBold: 0.5,
    rusticPolished: 0.6,
  },
  signalsUsed: [],
  confidence: { cuisine: 0.9, businessType: 0.9, priceTier: 0.9, personality: 0.9 },
};

const content: ContentCore = {
  tagline: "Handmade pasta, done right",
  heroHeadline: "Welcome to Trattoria Bella",
  heroSubhead: "Family recipes, fresh every day.",
  aboutStory: "Founded in 1998 by the Bellini family.",
  signatureDishesIntro: "A few of our favorites.",
  galleryIntro: "A look inside our kitchen.",
  ctaLabel: "View Menu",
};

function buildFor(family: "LUXURY" | "MODERN" | "MINIMAL") {
  const theme = THEME_CATALOG.find((t) => t.styleFamily === family)!;
  return buildSiteDefinition({ ingest, brandProfile, family, theme, content, colorSeed: theme.tokens.colorSeed });
}

describe("buildSiteDefinition", () => {
  it("produces a schema-valid definition for every style family", () => {
    for (const family of ["LUXURY", "MODERN", "MINIMAL"] as const) {
      const result = siteDefinitionSchema.safeParse(buildFor(family));
      expect(result.success).toBe(true);
    }
  });

  it("always includes all five pages: home, menu, about, contact, gallery", () => {
    const definition = buildFor("MODERN");
    expect(definition.pages.map((p) => p.slug).sort()).toEqual(["/", "/about", "/contact", "/gallery", "/menu"]);
  });

  it("every page has at least one section", () => {
    const definition = buildFor("MODERN");
    for (const page of definition.pages) {
      expect(page.sections.length).toBeGreaterThan(0);
    }
  });

  it("threads designRationale through so the Variation Picker can show 'why this design'", () => {
    const theme = THEME_CATALOG.find((t) => t.styleFamily === "MODERN")!;
    const definition = buildSiteDefinition({
      ingest,
      brandProfile,
      family: "MODERN",
      theme,
      content,
      colorSeed: theme.tokens.colorSeed,
      designRationale: ["strong italian affinity", "bistro, formal tone"],
    });
    expect(definition.designRationale).toEqual(["strong italian affinity", "bistro, formal tone"]);
  });

  it("never includes a testimonials section", () => {
    const definition = buildFor("LUXURY");
    const allTypes = definition.pages.flatMap((p) => p.sections.map((s) => s.type));
    expect(allTypes).not.toContain("testimonials");
  });

  it("keeps facts byte-identical across all three style family variations", () => {
    const luxury = buildFor("LUXURY");
    const modern = buildFor("MODERN");
    const minimal = buildFor("MINIMAL");
    expect(luxury.facts).toEqual(modern.facts);
    expect(modern.facts).toEqual(minimal.facts);
  });

  it("never invents a testimonial, address, or phone value beyond what was ingested", () => {
    const definition = buildFor("MODERN");
    expect(definition.facts.address).toBe(ingest.address);
    expect(definition.facts.phone).toBe(ingest.phone);
  });

  it("omits the gallery section on the home page when there are no photos", () => {
    const noPhotos = buildSiteDefinition({
      ingest: { ...ingest, photoCount: 0 },
      brandProfile,
      family: "MODERN",
      theme: THEME_CATALOG.find((t) => t.key === "modern-bistro")!,
      content,
      colorSeed: "#e8590c",
    });
    const homeSectionTypes = noPhotos.pages.find((p) => p.slug === "/")!.sections.map((s) => s.type);
    expect(homeSectionTypes).not.toContain("gallery");
  });

  it("still produces a valid menu page even with zero menu items", () => {
    const emptyMenu = buildSiteDefinition({
      ingest: { ...ingest, menu: [] },
      brandProfile,
      family: "MINIMAL",
      theme: THEME_CATALOG.find((t) => t.key === "cafe")!,
      content,
      colorSeed: "#6f4e37",
    });
    const result = siteDefinitionSchema.safeParse(emptyMenu);
    expect(result.success).toBe(true);
  });

  it("groups signature dishes with at most one item per category, capped at 6", () => {
    const definition = buildFor("MODERN");
    const home = definition.pages.find((p) => p.slug === "/")!;
    const signature = home.sections.find((s) => s.type === "signatureDishes");
    expect(signature).toBeDefined();
    const items = (signature!.props as { items: unknown[] }).items;
    expect(items.length).toBeLessThanOrEqual(6);
  });
});
