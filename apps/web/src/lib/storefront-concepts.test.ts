import { describe, expect, it } from "vitest";
import { listAllConcepts, storefrontConcept } from "./storefront-concepts";

/**
 * Principle 2 (locked): the words Theme, Template, Variation, Modern, Luxury,
 * Local, Style Family must NEVER appear in customer-facing UI. This is the
 * enforcement bar for the naming layer.
 */
const BANNED = /\b(theme|template|variation|modern|luxury|local|style\s*family)\b/i;

describe("storefront concept naming", () => {
  it("never emits banned theme/template vocabulary in any name or description", () => {
    for (const concept of listAllConcepts()) {
      expect(concept.name, `name: ${concept.name}`).not.toMatch(BANNED);
      expect(concept.description, `description: ${concept.description}`).not.toMatch(BANNED);
    }
  });

  it("uses the curated vape names", () => {
    expect(storefrontConcept("VAPE_SHOP", "LUXURY").name).toBe("The Flagship");
    expect(storefrontConcept("VAPE_SHOP", "MODERN").name).toBe("The Showcase");
    expect(storefrontConcept("VAPE_SHOP", "MINIMAL").name).toBe("The Corner Shop");
  });

  it("uses the curated coffee and deli names", () => {
    expect(storefrontConcept("COFFEE_SHOP", "MINIMAL").name).toBe("The Signature Cafe");
    expect(storefrontConcept("DELI", "MODERN").name).toBe("The Counter");
  });

  it("is case-insensitive on business type", () => {
    expect(storefrontConcept("vape_shop", "LUXURY").name).toBe("The Flagship");
  });

  it("falls back to default concepts for unknown business types", () => {
    const concept = storefrontConcept("SOMETHING_NEW", "MODERN");
    expect(concept.name).toBe("The Showcase");
    expect(concept.description.length).toBeGreaterThan(0);
  });

  it("resolves a name by index when style family is absent", () => {
    expect(storefrontConcept("VAPE_SHOP", null, 0).name).toBe("The Flagship"); // index 0 -> LUXURY
    expect(storefrontConcept("VAPE_SHOP", null, 1).name).toBe("The Showcase"); // index 1 -> MODERN
    expect(storefrontConcept("VAPE_SHOP", null, 2).name).toBe("The Corner Shop"); // index 2 -> MINIMAL
  });
});
