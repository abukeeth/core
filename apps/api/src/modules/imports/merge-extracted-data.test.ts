import { describe, expect, it } from "vitest";
import { mergeExtractedMenuData } from "./merge-extracted-data";

describe("mergeExtractedMenuData", () => {
  it("concatenates categories across results in order", () => {
    const result = mergeExtractedMenuData([
      { categories: [{ name: "Appetizers", items: [] }] },
      { categories: [{ name: "Mains", items: [] }] },
    ]);

    expect(result.categories.map((c) => c.name)).toEqual(["Appetizers", "Mains"]);
  });

  it("fills businessProfile fields from the first result that has each one", () => {
    const result = mergeExtractedMenuData([
      { categories: [], businessProfile: { name: "Joe's Diner" } },
      { categories: [], businessProfile: { name: "Ignored", address: "123 Main St" } },
      { categories: [], businessProfile: { phone: "555-0100" } },
    ]);

    expect(result.businessProfile).toEqual({
      name: "Joe's Diner",
      address: "123 Main St",
      phone: "555-0100",
    });
  });

  it("omits businessProfile entirely when no result has one", () => {
    const result = mergeExtractedMenuData([
      { categories: [{ name: "Mains", items: [] }] },
      { categories: [] },
    ]);

    expect(result.businessProfile).toBeUndefined();
  });

  it("handles empty-categories results without erroring", () => {
    const result = mergeExtractedMenuData([{ categories: [] }, { categories: [] }]);

    expect(result.categories).toEqual([]);
    expect(result.businessProfile).toBeUndefined();
  });

  it("handles an empty results array", () => {
    const result = mergeExtractedMenuData([]);

    expect(result.categories).toEqual([]);
  });

  it("fills the new profile fields (website/hours/logoUrl) from the first result that has each one (Sprint 10)", () => {
    const result = mergeExtractedMenuData([
      { categories: [], businessProfile: { website: "https://joes.example" } },
      { categories: [], businessProfile: { website: "https://ignored.example", hours: ["Monday: 9-9"] } },
      { categories: [], businessProfile: { logoUrl: "https://cdn.example/logo.jpg" } },
    ]);

    expect(result.businessProfile).toEqual({
      website: "https://joes.example",
      hours: ["Monday: 9-9"],
      logoUrl: "https://cdn.example/logo.jpg",
    });
  });

  it("dedupes socialLinks by platform, keeping the first URL seen per platform", () => {
    const result = mergeExtractedMenuData([
      { categories: [], businessProfile: { socialLinks: [{ platform: "instagram", url: "https://instagram.com/joes" }] } },
      {
        categories: [],
        businessProfile: {
          socialLinks: [
            { platform: "instagram", url: "https://instagram.com/ignored" },
            { platform: "facebook", url: "https://facebook.com/joes" },
          ],
        },
      },
    ]);

    expect(result.businessProfile?.socialLinks).toEqual([
      { platform: "instagram", url: "https://instagram.com/joes" },
      { platform: "facebook", url: "https://facebook.com/joes" },
    ]);
  });

  it("preserves per-item confidence scores through the merge", () => {
    const result = mergeExtractedMenuData([
      { categories: [{ name: "Mains", items: [{ name: "Burger", priceCents: 1000, confidence: 0.92 }] }] },
    ]);

    expect(result.categories[0]!.items[0]!.confidence).toBe(0.92);
  });
});
