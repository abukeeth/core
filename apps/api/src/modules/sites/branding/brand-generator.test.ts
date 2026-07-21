import { describe, expect, it } from "vitest";
import type { BrandProfile, IngestData } from "../types";
import { generateBrandKit } from "./brand-generator";
import { validatePalette } from "./palette-validator";

function ingest(name: string, businessTypeMenu: string[], description?: string): IngestData {
  return {
    restaurantId: "r1",
    restaurantName: name,
    description,
    address: "123 Main St, Springfield, IL 62704",
    phone: "555-0100",
    menu: businessTypeMenu.map((c, i) => ({ categoryName: c, name: `Item ${i}`, priceCents: 500 })),
    photoCount: 0,
  };
}

function brand(businessType: string): BrandProfile {
  return {
    cuisine: "",
    businessType,
    priceTier: 2,
    personality: { traditionalContemporary: 0.6, casualFormal: 0.5, playfulSerious: 0.5, understatedBold: 0.8, rusticPolished: 0.6 },
    signalsUsed: [],
    confidence: { cuisine: 0.5, businessType: 0.9, priceTier: 0.5, personality: 0.9 },
  };
}

const throwingComplete = { complete: async () => { throw new Error("no AI provider"); } };

describe("generateBrandKit — deterministic fallback (AI unavailable)", () => {
  it("produces a vertical-correct, non-food-biased fallback for a vape shop", async () => {
    const kit = await generateBrandKit(
      { ingest: ingest("Cloud Nine Vapor", ["Disposables"], "Premium vapes and e-liquids."), brandProfile: brand("vape shop"), vertical: "VAPE_SHOP" },
      throwingComplete,
    );
    expect(kit.source).toBe("fallback");
    expect(kit.vertical).toBe("VAPE_SHOP");
    expect(kit.vocabulary.itemNoun).toBe("Product"); // never "Dish"
    expect(kit.tagline).toBe("Cloud Nine Vapor — premium vapes you can trust");
    expect(kit.tagline).not.toMatch(/food/i);
    expect(kit.brandStory).toBe("Premium vapes and e-liquids."); // grounded in the real description
    expect(validatePalette(kit.palette).valid).toBe(true);
    expect(kit.palette.background).toBe("#0B0713");
  });

  it("uses the profile brand-story default when there is no description", async () => {
    const kit = await generateBrandKit(
      { ingest: ingest("Daybreak Coffee", ["Espresso"]), brandProfile: brand("coffee shop"), vertical: "COFFEE_SHOP" },
      throwingComplete,
    );
    expect(kit.vocabulary.itemNoun).toBe("Drink");
    expect(kit.tagline).toBe("Daybreak Coffee — small-batch coffee, crafted daily");
    expect(kit.brandStory).toContain("Daybreak Coffee");
  });

  it("infers the vertical from the business type when none is passed", async () => {
    const kit = await generateBrandKit({ ingest: ingest("Corner Deli", ["Sandwiches"]), brandProfile: brand("corner deli") }, throwingComplete);
    expect(kit.vertical).toBe("DELI");
    expect(kit.vocabulary.itemNoun).toBe("Item");
  });
});

describe("generateBrandKit — AI-enriched", () => {
  it("uses the AI response and validates its palette", async () => {
    const aiJson = JSON.stringify({
      palette: { primary: "#3311BB", accent: "#22D3EE", background: "#0A0A12", text: "#F0F0F5" },
      tagline: "Cloud Nine — vape smarter",
      vocabulary: { catalogNoun: "Shop", itemNoun: "Product", itemPlural: "Products", categoryUnitSingular: "product", categoryUnitPlural: "products", primaryCta: "Shop Now", exploreLabel: "Shop the collection" },
      tone: { voice: "bold and modern", adjectives: ["premium"] },
      brandStory: "A trusted local vape shop.",
    });
    const kit = await generateBrandKit(
      { ingest: ingest("Cloud Nine Vapor", ["Disposables"]), brandProfile: brand("vape shop"), vertical: "VAPE_SHOP" },
      { complete: async () => `Sure! Here is the brand:\n${aiJson}` },
    );
    expect(kit.source).toBe("ai");
    expect(kit.tagline).toBe("Cloud Nine — vape smarter");
    expect(kit.palette.background).toBe("#0A0A12");
    expect(validatePalette(kit.palette).valid).toBe(true); // low-contrast primary was repaired
  });

  it("falls back when the AI response is not parseable JSON", async () => {
    const kit = await generateBrandKit(
      { ingest: ingest("Cloud Nine Vapor", ["Disposables"]), brandProfile: brand("vape shop"), vertical: "VAPE_SHOP" },
      { complete: async () => "I couldn't do that." },
    );
    expect(kit.source).toBe("fallback");
    expect(kit.palette.background).toBe("#0B0713");
  });

  it("never ships an unreadable AI palette — it repairs low-contrast colors so it validates", async () => {
    const unreadable = JSON.stringify({ palette: { primary: "#808080", accent: "#808080", background: "#808080", text: "#808080" } });
    const kit = await generateBrandKit(
      { ingest: ingest("Cloud Nine Vapor", ["Disposables"]), brandProfile: brand("vape shop"), vertical: "VAPE_SHOP" },
      { complete: async () => unreadable },
    );
    expect(validatePalette(kit.palette).valid).toBe(true);
  });
});
