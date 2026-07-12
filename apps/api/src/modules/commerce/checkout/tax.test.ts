import { describe, expect, it } from "vitest";
import { computeTaxCents } from "./tax";

function taxRule(overrides: Record<string, unknown> = {}) {
  return { id: "t1", restaurantId: "r1", jurisdiction: "IL", rateBasisPoints: 875, appliesTo: "ALL", isActive: true, ...overrides };
}

describe("computeTaxCents", () => {
  it("returns 0 with no rules", () => {
    expect(computeTaxCents([], 1000, 0)).toBe(0);
  });

  it("applies a FOOD-only rule to the subtotal, ignoring delivery fee", () => {
    expect(computeTaxCents([taxRule({ appliesTo: "FOOD", rateBasisPoints: 1000 })] as never, 1000, 500)).toBe(100);
  });

  it("applies a DELIVERY_FEE-only rule to the delivery fee, ignoring subtotal", () => {
    expect(computeTaxCents([taxRule({ appliesTo: "DELIVERY_FEE", rateBasisPoints: 1000 })] as never, 1000, 500)).toBe(50);
  });

  it("applies an ALL rule to subtotal + delivery fee combined", () => {
    expect(computeTaxCents([taxRule({ appliesTo: "ALL", rateBasisPoints: 1000 })] as never, 1000, 500)).toBe(150);
  });

  it("sums multiple active rules", () => {
    const rules = [taxRule({ appliesTo: "FOOD", rateBasisPoints: 500 }), taxRule({ appliesTo: "FOOD", rateBasisPoints: 300 })];
    expect(computeTaxCents(rules as never, 1000, 0)).toBe(80);
  });

  it("ignores inactive rules", () => {
    expect(computeTaxCents([taxRule({ isActive: false, rateBasisPoints: 9999 })] as never, 1000, 0)).toBe(0);
  });
});
