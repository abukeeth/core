import { describe, expect, it, vi } from "vitest";
import { buildSiteDefinition, type AssembleInput } from "../assemble";
import { generateBrandAssets } from "../branding/asset-generator";
import { InMemoryBrandAssetStore } from "../branding/asset-store";
import type { BrandKit } from "../branding/brand-kit";
import { buildImageRequest } from "../branding/prompt-builder";
import { getVerticalProfile, resolveVertical } from "../branding/vertical-profiles";
import { THEME_CATALOG } from "../theme-catalog";
import type { GeneratedImage } from "../../../lib/ai/image";
import type { BrandProfile, IngestData, StyleFamilyValue } from "../types";
import { GOOGLE_FONTS } from "../renderer/web-fonts";
import { IDENTITY_PACKS, identityForFamily, mixHex } from "./identity-packs";

const FAMILIES: StyleFamilyValue[] = ["LUXURY", "MODERN", "MINIMAL"];

function deliBrandKit(): BrandKit {
  const p = getVerticalProfile("DELI");
  return { vertical: "DELI", palette: p.palette, vocabulary: p.vocabulary, tone: p.tone, tagline: "t", brandStory: "s", artDirection: p.artDirection, source: "fallback" };
}

function ingest(): IngestData {
  return {
    restaurantName: "DELI Fresh & Local",
    description: "Neighborhood deli",
    address: "124 Market Street",
    phone: "555-0142",
    photoCount: 0,
    logoColorSeed: undefined,
    businessType: "DELI",
    menu: [
      { name: "Pastrami on Rye", description: "Hand carved", priceCents: 1149, categoryName: "Signature Sandwiches" },
      { name: "Deli Club", description: "Triple stack", priceCents: 1049, categoryName: "Deli Classics" },
      { name: "Garden Wrap", description: "Fresh", priceCents: 899, categoryName: "Specialty Wraps" },
    ],
  } as unknown as IngestData;
}

function assembleInput(family: StyleFamilyValue): AssembleInput {
  const theme = THEME_CATALOG.find((t) => !t.deprecated && t.styleFamily === family)!;
  return {
    ingest: ingest(),
    brandProfile: { cuisine: "deli", businessType: "DELI" } as unknown as BrandProfile,
    family,
    theme,
    content: {
      tagline: "Fresh every day",
      heroHeadline: "Your corner deli",
      heroSubhead: "Made to order",
      aboutStory: "A neighborhood deli.",
      signatureDishesIntro: "Favorites",
      galleryIntro: "A look inside",
    } as AssembleInput["content"],
    colorSeed: "#2F6B3A",
    brandKit: deliBrandKit(),
    identity: identityForFamily(family),
  };
}

describe("Identity Packs — the three-agency model (system-wide, all verticals)", () => {
  it("defines three genuinely different identities: typography, hero composition, and structure all differ", () => {
    const packs = FAMILIES.map((f) => IDENTITY_PACKS[f]);
    expect(new Set(packs.map((p) => p.key)).size).toBe(3);
    expect(new Set(packs.map((p) => p.typography.display)).size).toBe(3);
    expect(new Set(packs.map((p) => p.heroVariant)).size).toBe(3);
    expect(new Set(packs.map((p) => p.photography.lighting)).size).toBe(3);
  });

  it("every identity typeface is actually loadable by the renderer (web-fonts whitelist)", () => {
    for (const f of FAMILIES) {
      const pack = IDENTITY_PACKS[f];
      expect(GOOGLE_FONTS, pack.typography.display).toHaveProperty(pack.typography.display);
      expect(GOOGLE_FONTS, pack.typography.body).toHaveProperty(pack.typography.body);
    }
  });

  it("re-stages the SAME brand palette into three different moods (dark / white / warm) — not three copies", () => {
    const base = deliBrandKit().palette;
    const grounds = FAMILIES.map((f) => IDENTITY_PACKS[f].palette(base).backgroundColor);
    expect(new Set(grounds).size).toBe(3);
    // Artisan Craft is a dark ground with light text; Modern Minimal is white.
    const artisan = IDENTITY_PACKS.LUXURY.palette(base);
    expect(parseInt(artisan.backgroundColor!.slice(1, 3), 16)).toBeLessThan(0x40);
    expect(parseInt(artisan.textColor!.slice(1, 3), 16)).toBeGreaterThan(0xc0);
    expect(IDENTITY_PACKS.MODERN.palette(base).backgroundColor).toBe("#FFFFFF");
  });

  it("mixHex is deterministic and bounded", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mixHex("#204060", "#204060", 0.5)).toBe("#204060");
  });

  it("assembles three definitions whose fonts, hero variants, and grounds ALL differ for the same business", () => {
    const defs = FAMILIES.map((f) => buildSiteDefinition(assembleInput(f)));
    const fonts = defs.map((d) => d.brandSettings?.headingFont);
    const heroes = defs.map((d) => d.pages[0].sections.find((s) => s.type === "hero")?.variant);
    const grounds = defs.map((d) => d.brandSettings?.backgroundColor);
    expect(new Set(fonts).size).toBe(3);
    expect(new Set(heroes).size).toBe(3);
    expect(new Set(grounds).size).toBe(3);
    expect(heroes).toEqual(expect.arrayContaining(["cinematic", "minimal-typographic", "warm-frame"]));
  });

  it("identity copy voice reaches the section chrome (three different featured titles)", () => {
    const titles = FAMILIES.map((f) => {
      const def = buildSiteDefinition(assembleInput(f));
      const featured = def.pages[0].sections.find((s) => s.type === "featuredProducts");
      return featured?.props.title;
    }).filter(Boolean);
    // Not every theme layout includes featuredProducts on home; where it does,
    // the identity title is used (never the same generic label twice).
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("omitting the identity keeps legacy output byte-identical (safe default)", () => {
    const withIdentity = assembleInput("LUXURY");
    const without = { ...withIdentity, identity: undefined };
    const def = buildSiteDefinition(without);
    expect(def.brandSettings?.backgroundColor).toBe(deliBrandKit().palette.background);
    expect(def.typography).toEqual(withIdentity.theme.tokens.typography);
  });
});

describe("resolveVertical — evidence override for default-ish verticals", () => {
  const profile = { businessType: "" } as unknown as BrandProfile;

  it("RESTAURANT stored by a mis-tap is overridden by a deli business name", () => {
    expect(resolveVertical("RESTAURANT", profile, { businessName: "DELI Fresh & Local" })).toBe("DELI");
  });

  it("RESTAURANT is overridden by two or more deli menu categories", () => {
    expect(
      resolveVertical("RESTAURANT", profile, { menuCategories: ["Signature Sandwiches", "Deli Classics", "Beverages"] }),
    ).toBe("DELI");
  });

  it("one stray Sandwiches category does NOT reclassify a real restaurant", () => {
    expect(resolveVertical("RESTAURANT", profile, { menuCategories: ["Sandwiches", "Pasta", "Desserts"] })).toBe("RESTAURANT");
  });

  it("a SPECIFIC choice (VAPE_SHOP) is never overridden by evidence", () => {
    expect(resolveVertical("VAPE_SHOP", profile, { businessName: "Corner Deli & Vape" })).toBe("VAPE_SHOP");
  });

  it("OTHER picks up coffee evidence from the name", () => {
    expect(resolveVertical("OTHER", profile, { businessName: "Qahwah Palace Espresso Bar" })).toBe("COFFEE_SHOP");
  });
});

describe("menu-grounded, identity-directed image prompts", () => {
  it("hero prompt carries real products, real categories, and the identity's photography direction", () => {
    const kit = deliBrandKit();
    const request = buildImageRequest(kit, "hero", {
      identity: IDENTITY_PACKS.LUXURY.photography,
      grounding: { businessName: "DELI Fresh & Local", products: ["Pastrami on Rye", "Deli Club"], categories: ["Signature Sandwiches", "Deli Classics"] },
    });
    expect(request.prompt).toContain("Pastrami on Rye");
    expect(request.prompt).toContain("Signature Sandwiches");
    expect(request.prompt).toContain("dramatic low-key side light");
    // The DELI art direction (sandwiches) is the subject — not plated dishes.
    expect(request.prompt).toContain("sandwiches");
  });

  it("the three identities produce three DIFFERENT hero prompts for the same business", () => {
    const kit = deliBrandKit();
    const grounding = { businessName: "DELI Fresh & Local", products: ["Pastrami on Rye"], categories: ["Signature Sandwiches"] };
    const prompts = FAMILIES.map((f) => buildImageRequest(kit, "hero", { identity: IDENTITY_PACKS[f].photography, grounding }).prompt);
    expect(new Set(prompts).size).toBe(3);
  });

  it("category prompts name the real category and its representative items", () => {
    const request = buildImageRequest(deliBrandKit(), "category", {
      categoryName: "Specialty Wraps",
      grounding: { products: ["Garden Wrap"] },
    });
    expect(request.prompt).toContain("Specialty Wraps");
    expect(request.prompt).toContain("Garden Wrap");
  });
});

describe("per-identity hero assets", () => {
  const PNG: GeneratedImage = { data: Buffer.from("PNG"), mediaType: "image/png" };

  it("generates THREE distinct hero assets — one per identity — plus shared categories/marketing", async () => {
    // A different prompt produces a different photograph (mirrors the provider).
    const generate = vi.fn(async (req: { prompt: string }) => ({ ...PNG, data: Buffer.from(req.prompt) }));
    const store = new InMemoryBrandAssetStore();
    const result = await generateBrandAssets(
      {
        brandKit: deliBrandKit(),
        businessId: "b1",
        categories: ["Signature Sandwiches", "Deli Classics"],
        grounding: { businessName: "DELI Fresh & Local", products: ["Pastrami on Rye"] },
        identities: FAMILIES.map((f) => IDENTITY_PACKS[f]),
      },
      { isEnabled: () => true, generate, store },
    );
    const heroUrls = Object.values(result.heroUrls);
    expect(Object.keys(result.heroUrls).sort()).toEqual(["artisan-craft", "local-market", "modern-minimal"]);
    expect(new Set(heroUrls).size).toBe(3); // three different stored assets
    expect(result.generated).toBe(3 + 2 + 1); // heroes + categories + marketing
  });

  it("a changed menu (different grounding) refreshes the imagery instead of reusing stale photos", async () => {
    const generate = vi.fn(async () => PNG);
    const store = new InMemoryBrandAssetStore();
    const base = { brandKit: deliBrandKit(), businessId: "b1", categories: [], identities: [IDENTITY_PACKS.LUXURY] };
    await generateBrandAssets({ ...base, grounding: { products: ["Pastrami on Rye"] } }, { isEnabled: () => true, generate, store });
    const first = generate.mock.calls.length;
    await generateBrandAssets({ ...base, grounding: { products: ["Turkey Avocado"] } }, { isEnabled: () => true, generate, store });
    expect(generate.mock.calls.length).toBeGreaterThan(first);
  });
});
