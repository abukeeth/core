import { describe, expect, it } from "vitest";
import { computeCtaLabel } from "./cta";
import type { SiteFacts } from "./types";

function facts(overrides: Partial<SiteFacts> = {}): SiteFacts {
  return { restaurantName: "Test", hasOnlineOrdering: false, hasReservations: false, ...overrides };
}

describe("computeCtaLabel", () => {
  it("prefers ordering when online ordering exists, regardless of reservations", () => {
    expect(computeCtaLabel(facts({ hasOnlineOrdering: true, hasReservations: true }), "MODERN")).toBe("Order Now");
  });

  it("falls back to reservations when ordering doesn't exist", () => {
    expect(computeCtaLabel(facts({ hasReservations: true }), "MODERN")).toBe("Book a Table");
  });

  it("falls back to viewing the menu when neither exists", () => {
    expect(computeCtaLabel(facts(), "MODERN")).toBe("View Menu");
  });

  it("uses formal Luxury copy for reservations", () => {
    expect(computeCtaLabel(facts({ hasReservations: true }), "LUXURY")).toBe("Reserve a Table");
  });

  it("uses terse Minimal copy for the menu fallback", () => {
    expect(computeCtaLabel(facts(), "MINIMAL")).toBe("Menu");
  });
});
