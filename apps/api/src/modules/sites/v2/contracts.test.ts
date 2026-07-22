import { afterEach, describe, expect, it } from "vitest";
import {
  businessUnderstandingSchema,
  creativeBriefSchema,
  generatedAssetPlanSchema,
  INTERNAL_ONLY_TERMS,
  storefrontPlanSchema,
} from "./contracts";
import { isGenerationV2Enabled } from "./rollout";

const understanding = {
  schemaVersion: 1,
  identity: { name: "DELI Fresh & Local", resolvedVertical: "DELI", positioning: "Neighborhood deli, made to order", priceTier: "casual" },
  catalog: {
    categories: [{ name: "Signature Sandwiches", itemCount: 6, priceRangeCents: [899, 1149], representativeItems: ["Pastrami on Rye"] }],
    flagshipProducts: ["Pastrami on Rye", "Deli Club"],
    menuBreadth: { categoryCount: 7, itemCount: 24 },
    hasPhotos: false,
  },
  services: { pickup: true, delivery: false, dineIn: true, reservations: false },
  sourceSignals: { sourceType: "menu-image", locale: "en" },
  evidence: [{ claim: "Deli evidenced by name + sandwich categories", source: "MENU", confidence: 0.95 }],
};

const brief = {
  schemaVersion: 1,
  id: "b1",
  centralIdea: "The baker's clock as narrative",
  targetCustomer: "Early regulars",
  brandPersonality: ["crafted", "honest"],
  valueProposition: "Fresh before the city wakes",
  differentiator: "Timestamped bakes",
  copyVoice: { voice: "plainspoken pride", sampleHeadline: "Baked before the city wakes.", sampleCta: "Reserve today's loaf" },
  photography: { treatment: "reportage", lighting: "fire-lit", backdrop: "stone oven", subjects: ["sourdough", "hands scoring dough"] },
  typography: { display: "Bricolage Grotesque", body: "Inter" },
  colorLogic: {
    rationale: "Pre-dawn charcoal with ember accent",
    ground: { hex: "#15110C", luminanceClass: "dark" },
    ink: "#F4EADB",
    brand: "#E07A2F",
    accent: "#E07A2F",
  },
  heroConcept: { composition: "editorial-split", headline: "Baked before the city wakes.", subhead: "First loaves at 7.", imageSubject: "oven mouth, flour dust" },
  productPresentation: { layout: "editorial-rows", emphasis: "timeline" },
  shape: { buttonStyle: "square", borderRadius: 2, shadowIntensity: "none" },
  conversionStrategy: { primaryCta: "Reserve today's loaf", trustSignals: ["Sells out daily"] },
  structure: { home: ["hero", "signatureDishes", "aboutTeaser", "footer"] },
};

afterEach(() => {
  delete process.env.GENERATION_V2_ENABLED;
  delete process.env.GENERATION_V2_RESTAURANT_IDS;
});

describe("V2 contracts", () => {
  it("accepts a well-formed BusinessUnderstanding and requires evidence", () => {
    expect(businessUnderstandingSchema.parse(understanding).identity.resolvedVertical).toBe("DELI");
    expect(() => businessUnderstandingSchema.parse({ ...understanding, evidence: [] })).toThrow();
  });

  it("accepts a well-formed CreativeBrief and rejects unknown hero compositions (capability inventory, not styles)", () => {
    expect(creativeBriefSchema.parse(brief).heroConcept.composition).toBe("editorial-split");
    expect(() =>
      creativeBriefSchema.parse({ ...brief, heroConcept: { ...brief.heroConcept, composition: "artisan-craft" } }),
    ).toThrow();
  });

  it("StorefrontPlan carries tokens + pages and NO theme/family fields", () => {
    const plan = storefrontPlanSchema.parse({
      schemaVersion: 1,
      briefId: "b1",
      pages: [{ slug: "/", title: "Home", metaDescription: "d", sections: [{ type: "hero", props: {} }] }],
      tokens: {
        headingFont: "Bricolage Grotesque",
        bodyFont: "Inter",
        primaryColor: "#E07A2F",
        accentColor: "#E07A2F",
        backgroundColor: "#15110C",
        textColor: "#F4EADB",
        buttonStyle: "square",
        borderRadius: 2,
        shadowIntensity: "none",
        contentSpacing: "spacious",
      },
      vocabulary: { catalogNoun: "Menu", itemPlural: "Items", primaryCta: "Order Now" },
    });
    expect(plan).not.toHaveProperty("themeKey");
    expect(plan).not.toHaveProperty("styleFamily");
    expect(JSON.stringify(plan)).not.toMatch(/themeKey|styleFamily/);
  });

  it("GeneratedAssetPlan requires a hero prompt PER storefront (never shared)", () => {
    const plan = generatedAssetPlanSchema.parse({
      schemaVersion: 1,
      perStorefront: [
        {
          briefId: "b1",
          hero: { surface: "hero", prompt: "p1", negativePrompt: "n", aspect: "landscape", cacheKey: "k1" },
          categoryImages: [],
        },
        {
          briefId: "b2",
          hero: { surface: "hero", prompt: "p2", negativePrompt: "n", aspect: "landscape", cacheKey: "k2" },
          categoryImages: [],
        },
      ],
      budget: 12,
    });
    const keys = plan.perStorefront.map((s) => s.hero.cacheKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("locks the internal-only vocabulary list the customer-facing guards assert against", () => {
    expect(INTERNAL_ONLY_TERMS).toEqual(expect.arrayContaining(["theme", "identity", "brief", "archetype", "style family"]));
  });
});

describe("V2 rollout gate", () => {
  it("is OFF by default, even for allowlisted ids", () => {
    process.env.GENERATION_V2_RESTAURANT_IDS = "r1";
    expect(isGenerationV2Enabled("r1")).toBe(false);
  });

  it("enabled + allowlist scopes exactly the listed businesses", () => {
    process.env.GENERATION_V2_ENABLED = "true";
    process.env.GENERATION_V2_RESTAURANT_IDS = "r1, r2";
    expect(isGenerationV2Enabled("r1")).toBe(true);
    expect(isGenerationV2Enabled("r2")).toBe(true);
    expect(isGenerationV2Enabled("r3")).toBe(false);
  });

  it("enabled with an EMPTY allowlist selects no one (explicit '*' opens it up)", () => {
    process.env.GENERATION_V2_ENABLED = "true";
    expect(isGenerationV2Enabled("anyone")).toBe(false);
    process.env.GENERATION_V2_RESTAURANT_IDS = "*";
    expect(isGenerationV2Enabled("anyone")).toBe(true);
  });
});
