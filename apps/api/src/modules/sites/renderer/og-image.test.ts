import { describe, expect, it } from "vitest";
import { renderOgImageSvg } from "./og-image";

describe("renderOgImageSvg", () => {
  it("produces a 1200x630 SVG (§10)", () => {
    const svg = renderOgImageSvg({ restaurantName: "Trattoria Bella", cuisine: "italian", colorSeed: "#8b2f2f" });
    expect(svg).toContain('width="1200" height="630"');
  });

  it("escapes restaurant name/cuisine to prevent SVG/XML injection", () => {
    const svg = renderOgImageSvg({ restaurantName: "<script>alert(1)</script>", cuisine: "italian", colorSeed: "#8b2f2f" });
    expect(svg).not.toContain("<script>alert(1)</script>");
  });

  it("uses the theme's derived palette for its background", () => {
    const svg = renderOgImageSvg({ restaurantName: "X", cuisine: "y", colorSeed: "#8b2f2f" });
    expect(svg).toMatch(/fill="#[0-9a-f]{6}"/i);
  });

  it("is deterministic for the same input", () => {
    const input = { restaurantName: "X", cuisine: "y", colorSeed: "#8b2f2f" };
    expect(renderOgImageSvg(input)).toBe(renderOgImageSvg(input));
  });
});
