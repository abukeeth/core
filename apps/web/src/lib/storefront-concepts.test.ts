import { describe, expect, it } from "vitest";
import { conceptVocabulary, storefrontConcept } from "./storefront-concepts";

// Locked: these words must NEVER reach customer-facing UI (theme vocabulary + "AI").
const BANNED = /\b(ai|theme|themes|template|templates|variation|variations|modern|luxury|local|style\s*family)\b/i;

describe("storefront concept naming", () => {
  it("never emits banned vocabulary in tier words or descriptions", () => {
    for (const phrase of conceptVocabulary()) {
      expect(phrase, phrase).not.toMatch(BANNED);
    }
  });

  it("builds premium, business-specific names ranked by display order", () => {
    expect(storefrontConcept("Easy Tobacco Shop", 0).name).toBe("Easy Tobacco Prestige");
    expect(storefrontConcept("Easy Tobacco Shop", 2).name).toBe("Easy Tobacco Signature");
    // recommended (index 0) is always "Prestige"; last is always "Signature".
    const middle = storefrontConcept("Easy Tobacco Shop", 1).name;
    expect(middle.startsWith("Easy Tobacco ")).toBe(true);
    expect(["Prime", "Reserve", "Elite", "Select"]).toContain(middle.replace("Easy Tobacco ", ""));
  });

  it("trims generic suffixes (Shop / Cafe / Coffee / Restaurant)", () => {
    expect(storefrontConcept("Qahwah Palace Coffee", 0).name).toBe("Qahwah Palace Prestige");
    expect(storefrontConcept("Velnoma", 0).name).toBe("Velnoma Prestige");
  });

  it("is deterministic (same business → same middle tier every time)", () => {
    expect(storefrontConcept("Qahwah Palace", 1).name).toBe(storefrontConcept("Qahwah Palace", 1).name);
  });

  it("never exposes the internal theme/style family — name depends only on business + rank", () => {
    // Two businesses of different verticals but same rank get the same tier word.
    expect(storefrontConcept("A Vape Store", 0).name.endsWith("Prestige")).toBe(true);
    expect(storefrontConcept("A Coffee Shop", 0).name.endsWith("Prestige")).toBe(true);
  });

  it("falls back gracefully when no business name is present", () => {
    expect(storefrontConcept(null, 0).name).toBe("Your Store Prestige");
  });
});
