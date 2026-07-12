import { describe, expect, it } from "vitest";
import { buildMetaDescription, buildPageTitle, guessCityFromAddress } from "./seo";

describe("guessCityFromAddress", () => {
  it("extracts the city from a standard 'street, city, state zip' address", () => {
    expect(guessCityFromAddress("123 Main St, Springfield, IL 62704")).toBe("Springfield");
  });

  it("returns undefined for an address with no commas", () => {
    expect(guessCityFromAddress("123 Main St")).toBeUndefined();
  });

  it("returns undefined when there's no address", () => {
    expect(guessCityFromAddress(undefined)).toBeUndefined();
  });
});

describe("buildPageTitle", () => {
  it("includes the city when known", () => {
    expect(buildPageTitle("Home", "Trattoria Bella", "Italian", "Springfield")).toBe(
      "Home — Trattoria Bella | Italian in Springfield",
    );
  });

  it("omits 'in {city}' when no city is known", () => {
    expect(buildPageTitle("Home", "Trattoria Bella", "Italian")).toBe("Home — Trattoria Bella | Italian");
  });

  it("never exceeds 70 characters", () => {
    const title = buildPageTitle("Home", "A".repeat(100), "Italian", "Springfield");
    expect(title.length).toBeLessThanOrEqual(70);
  });
});

describe("buildMetaDescription", () => {
  it("never exceeds 155 characters", () => {
    const description = buildMetaDescription("X".repeat(200), "Italian", "Springfield");
    expect(description.length).toBeLessThanOrEqual(155);
  });

  it("includes cuisine and city keywords when short enough", () => {
    const description = buildMetaDescription("Handmade pasta.", "Italian", "Springfield");
    expect(description).toContain("Italian");
    expect(description).toContain("Springfield");
  });
});
