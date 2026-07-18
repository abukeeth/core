import { describe, expect, it } from "vitest";
import { galleryStockPhotos, pickStockPhoto, stableHash, UNSPLASH_HOST } from "./imagery";

describe("imagery — business-aware stock photos", () => {
  it("always returns an allow-listed Unsplash CDN URL", () => {
    const url = pickStockPhoto({ slot: "food", cuisine: "italian", businessType: "bistro", key: "Spaghetti" });
    expect(url.startsWith(`${UNSPLASH_HOST}/photo-`)).toBe(true);
    expect(url).toContain("w=");
  });

  it("is deterministic on the key (same card → same photo across renders)", () => {
    const a = pickStockPhoto({ slot: "food", cuisine: "italian", key: "Lasagna" });
    const b = pickStockPhoto({ slot: "food", cuisine: "italian", key: "Lasagna" });
    expect(a).toBe(b);
  });

  it("varies photos across different items in a grid", () => {
    const urls = ["Carbonara", "Tiramisu", "Bruschetta", "Risotto"].map((k) => pickStockPhoto({ slot: "food", cuisine: "italian", key: k }));
    // Not all identical — a grid shows variety, not one repeated photo.
    expect(new Set(urls).size).toBeGreaterThan(1);
  });

  it("matches a category-name keyword regardless of cuisine (e.g. 'Desserts' → a dessert photo)", () => {
    const dessert = pickStockPhoto({ slot: "category", cuisine: "italian", key: "Sweet Desserts" });
    const dessert2 = pickStockPhoto({ slot: "category", cuisine: "mexican", key: "Dessert Menu" });
    // Keyword wins over cuisine, so both resolve to the same curated dessert photo.
    expect(dessert).toBe(dessert2);
  });

  it("chooses a hero photo by business type", () => {
    const cafe = pickStockPhoto({ slot: "hero", businessType: "cafe", key: "Blue Bottle" });
    const bakery = pickStockPhoto({ slot: "hero", businessType: "bakery", key: "Blue Bottle" });
    expect(cafe).not.toBe(bakery);
    expect(cafe).toContain(UNSPLASH_HOST);
  });

  it("falls back to generic imagery for an unknown cuisine rather than throwing", () => {
    const url = pickStockPhoto({ slot: "food", cuisine: "klingon-fusion", key: "Gagh" });
    expect(url).toContain(UNSPLASH_HOST);
  });

  it("returns the requested count of distinct gallery photos, even for a small cuisine pool", () => {
    const photos = galleryStockPhotos({ cuisine: "italian", count: 6 });
    expect(photos).toHaveLength(6);
    expect(new Set(photos).size).toBe(6);
    photos.forEach((p) => expect(p).toContain(UNSPLASH_HOST));
  });

  it("stableHash is non-negative and deterministic", () => {
    expect(stableHash("abc")).toBe(stableHash("abc"));
    expect(stableHash("abc")).toBeGreaterThanOrEqual(0);
  });
});
