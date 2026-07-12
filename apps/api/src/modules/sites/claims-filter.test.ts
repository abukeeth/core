import { describe, expect, it } from "vitest";
import { containsBannedClaim, sanitizeClaims } from "./claims-filter";

describe("sanitizeClaims", () => {
  it("strips a 'best ... in the world' claim", () => {
    const result = sanitizeClaims("We serve the best pizza in the world.");
    expect(result).not.toMatch(/best.*in the world/i);
    expect(containsBannedClaim(result)).toBe(false);
  });

  it("strips an award-winning claim", () => {
    expect(sanitizeClaims("Our award-winning tacos are legendary.")).toBe("Our tacos are legendary.");
  });

  it("strips a fabricated health claim", () => {
    expect(sanitizeClaims("Try the healthiest meal in town.")).toBe("Try the in town.");
  });

  it("leaves ordinary copy untouched", () => {
    const text = "Handmade pasta, fresh every day.";
    expect(sanitizeClaims(text)).toBe(text);
  });

  it("collapses extra whitespace left behind after stripping a phrase", () => {
    const result = sanitizeClaims("Come try our world-famous burgers today.");
    expect(result).not.toMatch(/\s{2,}/);
  });
});

describe("containsBannedClaim", () => {
  it("detects a banned claim", () => {
    expect(containsBannedClaim("Voted best restaurant in the city")).toBe(true);
  });

  it("returns false for clean copy", () => {
    expect(containsBannedClaim("Fresh ingredients, family recipes.")).toBe(false);
  });

  it("is safe to call repeatedly on the same input", () => {
    const text = "Best in the world pasta.";
    expect(containsBannedClaim(text)).toBe(true);
    expect(containsBannedClaim(text)).toBe(true);
    expect(containsBannedClaim(text)).toBe(true);
  });
});
