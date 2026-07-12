import { describe, expect, it } from "vitest";
import { mapRowsToMenu } from "./column-mapper";

describe("mapRowsToMenu", () => {
  it("groups a plain CSV export by its category column", () => {
    const result = mapRowsToMenu([
      { Category: "Appetizers", Name: "Spring Rolls", Description: "Crispy", Price: "5.99" },
      { Category: "Appetizers", Name: "Nachos", Description: "", Price: "8" },
      { Category: "Mains", Name: "Burger", Description: "", Price: "12.50" },
    ]);

    expect(result.categories.map((c) => c.name)).toEqual(["Appetizers", "Mains"]);
    expect(result.categories[0]!.items).toEqual([
      { name: "Spring Rolls", description: "Crispy", priceCents: 599, confidence: 1 },
      { name: "Nachos", description: undefined, priceCents: 800, confidence: 1 },
    ]);
  });

  it("recognizes Square-style export headers (Item Name / Price)", () => {
    const result = mapRowsToMenu([{ "Item Name": "Latte", Price: "4.50", Category: "Drinks" }]);

    expect(result.categories).toEqual([
      { name: "Drinks", items: [{ name: "Latte", description: undefined, priceCents: 450, confidence: 1 }] },
    ]);
  });

  it("recognizes Toast-style export headers (Menu Item / Menu Group)", () => {
    const result = mapRowsToMenu([{ "Menu Item": "Cheeseburger", "Menu Group": "Sandwiches", Price: "9.99" }]);

    expect(result.categories).toEqual([
      { name: "Sandwiches", items: [{ name: "Cheeseburger", description: undefined, priceCents: 999, confidence: 1 }] },
    ]);
  });

  it("defaults to Uncategorized when no category column is present", () => {
    const result = mapRowsToMenu([{ Name: "Fries", Price: "3" }]);

    expect(result.categories).toEqual([
      { name: "Uncategorized", items: [{ name: "Fries", description: undefined, priceCents: 300, confidence: 1 }] },
    ]);
  });

  it("flags a missing or unparseable price with low confidence instead of dropping the row", () => {
    const result = mapRowsToMenu([
      { Name: "Mystery Item", Price: "" },
      { Name: "Bad Price", Price: "call for price" },
    ]);

    expect(result.categories[0]!.items).toEqual([
      { name: "Mystery Item", description: undefined, priceCents: 0, confidence: 0.4 },
      { name: "Bad Price", description: undefined, priceCents: 0, confidence: 0.4 },
    ]);
  });

  it("skips rows with no item name", () => {
    const result = mapRowsToMenu([{ Name: "", Price: "5" }, { Name: "Real Item", Price: "5" }]);

    expect(result.categories[0]!.items).toHaveLength(1);
    expect(result.categories[0]!.items[0]!.name).toBe("Real Item");
  });

  it("handles an empty rows array", () => {
    expect(mapRowsToMenu([])).toEqual({ categories: [] });
  });
});
