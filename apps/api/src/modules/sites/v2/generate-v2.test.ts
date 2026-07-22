import { describe, expect, it } from "vitest";
import type { GeneratedImage } from "../../../lib/ai/image";
import type { IngestData } from "../types";
import { generateV2 } from "./generate-v2";
import { planStorefront } from "./planning/storefront-planner";
import { proceduralBriefs } from "./briefs/brief-generator";
import { proceduralCopy } from "./content/copy-writer";
import { buildBusinessUnderstanding } from "./understanding/build-understanding";

function ingestFor(name: string, type: string, menu: [string, string, number, string][], description = ""): IngestData {
  return {
    restaurantId: `r-${name.toLowerCase().replace(/\W+/g, "-")}`,
    restaurantName: name,
    description,
    address: "12 High Street",
    phone: "555-0100",
    photoCount: 0,
    businessType: type,
    menu: menu.map(([n, d, p, c]) => ({ name: n, description: d, priceCents: p, categoryName: c })),
  } as unknown as IngestData;
}

const DELI = ingestFor("DELI Fresh & Local", "RESTAURANT", [
  ["Pastrami on Rye", "Hand-carved, cured in-house", 1149, "Signature Sandwiches"],
  ["Deli Club", "Triple stacked daily", 1049, "Deli Classics"],
  ["Garden Wrap", "", 899, "Specialty Wraps"],
]);

const VAPE = ingestFor("Cloud Nine Vapor", "VAPE_SHOP", [
  ["Mango Ice 5000", "", 1899, "Disposables"],
  ["Blue Razz Pod Pack", "", 1599, "Pod Systems"],
  ["Coil 5-Pack", "", 1299, "Coils & Accessories"],
]);

const BAKERY = ingestFor("Golden Crust Bakery", "BAKERY", [
  ["Country Sourdough", "48-hour ferment, stone-baked", 850, "Breads"],
  ["Almond Croissant", "Laminated 27 layers", 425, "Pastries"],
  ["Chocolate Fudge Cake", "Whole, serves 12", 3200, "Cakes"],
]);

const PIZZA = ingestFor("Slice Society", "PIZZA", [["Margherita", "Wood-fired", 1450, "Pizzas"]]);
const CSTORE = ingestFor("QuickStop Corner Market", "CONVENIENCE_STORE", [["Fresh Coffee 16oz", "", 199, "Hot & Ready"]]);

const PNG: GeneratedImage = { data: Buffer.from("PNG"), mediaType: "image/png" };

describe("P2 rule 1 — vertical gaps closed", () => {
  it("BAKERY resolves to BAKERY (never OTHER), PIZZA to PIZZA, convenience to CONVENIENCE_STORE", () => {
    expect(buildBusinessUnderstanding({ ingest: BAKERY }).identity.resolvedVertical).toBe("BAKERY");
    expect(buildBusinessUnderstanding({ ingest: PIZZA }).identity.resolvedVertical).toBe("PIZZA");
    expect(buildBusinessUnderstanding({ ingest: CSTORE }).identity.resolvedVertical).toBe("CONVENIENCE_STORE");
  });
});

describe("generateV2 — the full theme-free pipeline", () => {
  it("produces three schemaVersion-2 definitions with NO themeKey and NO styleFamily", async () => {
    const result = await generateV2({ ingest: DELI, seed: "s1" });
    expect(result.storefronts).toHaveLength(3);
    for (const s of result.storefronts) {
      expect(s.definition.schemaVersion).toBe(2);
      expect(s.definition.themeKey).toBeUndefined();
      expect(s.definition.styleFamily).toBeUndefined();
      expect(s.definition.generation).toEqual({ engine: "v2", briefId: s.briefId });
    }
    expect(result.diversity.pass).toBe(true);
  });

  it("the three storefronts differ in hero variant, fonts, ground, product layout AND section order", async () => {
    const { storefronts } = await generateV2({ ingest: DELI, seed: "s1" });
    const heroes = storefronts.map((s) => s.definition.pages[0].sections.find((x) => x.type === "hero")?.variant);
    const fonts = storefronts.map((s) => s.definition.brandSettings?.headingFont);
    const grounds = storefronts.map((s) => s.definition.brandSettings?.backgroundColor);
    const layouts = storefronts.map((s) => s.definition.pages.find((p) => p.slug === "/menu")?.sections[0].variant);
    const orders = storefronts.map((s) => s.definition.pages[0].sections.map((x) => x.type).join(">"));
    expect(new Set(heroes).size).toBe(3);
    expect(new Set(fonts).size).toBe(3);
    expect(new Set(grounds).size).toBe(3);
    expect(new Set(layouts).size).toBe(3);
    expect(new Set(orders).size).toBe(3);
  });

  it("EXPERIENTIAL diversity: opening hierarchy, philosophy, hero rhythm and page length all differ", async () => {
    const result = await generateV2({ ingest: DELI, seed: "s1" });
    const openings = result.storefronts.map(
      (s) => s.definition.pages[0].sections.map((x) => x.type).filter((t) => t !== "hero" && t !== "ageGate")[0],
    );
    expect(new Set(openings).size).toBe(3); // three different first scrolls
    const philosophies = result.briefs.map((b) => b.structure.philosophy);
    expect(new Set(philosophies).size).toBe(3);
    const heights = result.storefronts.map((s) => s.definition.pages[0].sections.find((x) => x.type === "hero")?.props.height);
    expect(new Set(heights).size).toBeGreaterThanOrEqual(2); // rhythm varies from the first viewport
    const lengths = result.storefronts.map((s) => s.definition.pages[0].sections.length);
    expect(new Set(lengths).size).toBeGreaterThanOrEqual(2); // not three equally-long pages
  });

  it("CTA cadence is brief-owned: a utility philosophy may ship WITHOUT a cta banner", async () => {
    // Across seeds, at least one generated storefront omits ctaBanner entirely —
    // proof the planner never injects a shared rhythm.
    const seeds = ["s1", "s2", "s3", "s4", "s5"];
    let sawOmitted = false;
    for (const seed of seeds) {
      const { storefronts } = await generateV2({ ingest: DELI, seed });
      if (storefronts.some((s) => !s.definition.pages[0].sections.some((x) => x.type === "ctaBanner"))) sawOmitted = true;
    }
    expect(sawOmitted).toBe(true);
  });

  it("copy is independent per storefront — no shared headline, subhead, or about text", async () => {
    const { storefronts } = await generateV2({ ingest: DELI, seed: "s1" });
    for (const field of ["heroHeadline", "heroSubhead", "aboutStory"] as const) {
      const values = storefronts.map((s) => s.copy[field]);
      expect(new Set(values).size, field).toBe(3);
    }
  });

  it("imagery is independent per storefront — distinct hero cache keys, prompts, and generated URLs", async () => {
    const generate = async (req: { prompt: string }) => ({ ...PNG, data: Buffer.from(req.prompt) });
    const result = await generateV2({ ingest: DELI, seed: "s1" }, { assets: { isEnabled: () => true, generate } });
    const keys = result.assetPlan.perStorefront.map((s) => s.hero.cacheKey);
    const prompts = result.assetPlan.perStorefront.map((s) => s.hero.prompt);
    const urls = result.storefronts.map((s) => s.assets.heroUrl);
    expect(new Set(keys).size).toBe(3);
    expect(new Set(prompts).size).toBe(3);
    expect(new Set(urls).size).toBe(3);
    // Grounded in the real business:
    for (const p of prompts) expect(p).toContain("Pastrami on Rye");
  });

  it("PRODUCT photos: one grounded photo per real item, shared as business truth across all three storefronts", async () => {
    const generate = async (req: { prompt: string }) => ({ ...PNG, data: Buffer.from(req.prompt) });
    const result = await generateV2({ ingest: DELI, seed: "s1" }, { assets: { isEnabled: () => true, generate } });
    // Planned per item, grounded in the item's own name/description:
    const names = result.assetPlan.productImages.map((p) => p.productName);
    expect(names).toContain("Pastrami on Rye");
    const pastrami = result.assetPlan.productImages.find((p) => p.productName === "Pastrami on Rye")!;
    expect(pastrami.prompt).toContain("Hand-carved, cured in-house");
    // Shared identically into every storefront and persisted on the definition:
    for (const s of result.storefronts) {
      expect(s.assets.productImages["Pastrami on Rye"]).toBeTruthy();
      expect(s.definition.aiAssets?.productImages?.["Pastrami on Rye"]).toBe(s.assets.productImages["Pastrami on Rye"]);
    }
    const maps = result.storefronts.map((s) => JSON.stringify(s.assets.productImages));
    expect(new Set(maps).size).toBe(1); // business truth — same item, same photo everywhere
  });

  it("light-first balance: at most one dark ground per trio (procedural floor guarantees it)", async () => {
    for (const seed of ["s1", "s2", "s3", "s4"]) {
      const { storefronts } = await generateV2({ ingest: BAKERY, seed });
      const dark = storefronts.filter((s) => {
        const bg = s.definition.brandSettings?.backgroundColor ?? "#ffffff";
        const r = parseInt(bg.slice(1, 3), 16);
        return r < 0x40;
      });
      expect(dark.length, seed).toBeLessThanOrEqual(1);
    }
  });

  it("compliance is per-vertical, not per-design: every vape storefront leads with the age gate", async () => {
    const { storefronts } = await generateV2({ ingest: VAPE, seed: "s1" });
    for (const s of storefronts) {
      expect(s.definition.pages[0].sections[0].type).toBe("ageGate");
    }
  });

  it("vertical vocabulary + brief CTA reach the definition (a vape shop never says View Menu)", async () => {
    const { storefronts } = await generateV2({ ingest: VAPE, seed: "s1" });
    for (const s of storefronts) {
      expect(s.definition.vocabulary?.itemPlural).toBe("Products");
      expect(s.definition.vocabulary?.primaryCta).toBeTruthy();
      expect(s.definition.vocabulary?.primaryCta).not.toMatch(/view menu/i);
    }
  });

  it("no placeholder-looking sections: a photo-less business gets no gallery; live-data bands are excluded", async () => {
    const { storefronts } = await generateV2({ ingest: DELI, seed: "s1" });
    for (const s of storefronts) {
      const types = s.definition.pages[0].sections.map((x) => x.type);
      expect(types).not.toContain("gallery");
      for (const banned of ["bestSellers", "offers", "loyalty", "reviews"]) {
        expect(types).not.toContain(banned);
      }
    }
  });

  it("customer-facing text carries no generation vocabulary", async () => {
    const { storefronts } = await generateV2({ ingest: DELI, seed: "s1" });
    const BANNED = /\b(theme|template|variation|identity|brief|archetype|style family|schema)\b/i;
    for (const s of storefronts) {
      const visible = JSON.stringify([s.copy, s.definition.pages.map((p) => p.sections.map((x) => x.props))]);
      expect(visible).not.toMatch(BANNED);
    }
  });
});

describe("planner is brief-driven, not recipe-driven", () => {
  it("two briefs with different structures yield different page programs for the SAME business", () => {
    const u = buildBusinessUnderstanding({ ingest: DELI });
    const [a, , c] = proceduralBriefs(u, "seed-Z");
    const planA = planStorefront({ understanding: u, brief: a, copy: proceduralCopy(u, a), ingest: DELI });
    const planC = planStorefront({ understanding: u, brief: c, copy: proceduralCopy(u, c), ingest: DELI });
    expect(planA.pages[0].sections.map((s) => s.type)).not.toEqual(planC.pages[0].sections.map((s) => s.type));
  });
});
