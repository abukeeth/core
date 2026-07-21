import { describe, expect, it } from "vitest";
import type { BrandPalette } from "./brand-kit";
import {
  AA_TEXT_CONTRAST,
  UI_MIN_CONTRAST,
  contrastRatio,
  ensureReadablePalette,
  repairForeground,
  validatePalette,
} from "./palette-validator";

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for identical colors", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
    expect(contrastRatio("#123456", "#123456")).toBeCloseTo(1, 2);
  });
  it("returns 1 for invalid input", () => {
    expect(contrastRatio("nope", "#FFFFFF")).toBe(1);
  });
});

describe("validatePalette", () => {
  it("passes a readable palette", () => {
    const palette: BrandPalette = { primary: "#2563EB", accent: "#B45309", background: "#FFFFFF", text: "#1A1A1A" };
    expect(validatePalette(palette)).toEqual({ valid: true, issues: [] });
  });
  it("flags text that is too close to the background", () => {
    const palette: BrandPalette = { primary: "#2563EB", accent: "#B45309", background: "#808080", text: "#777777" };
    const result = validatePalette(palette);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("text/background"))).toBe(true);
  });
});

describe("repairForeground", () => {
  it("returns the color unchanged when it already meets the target", () => {
    expect(repairForeground("#000000", "#FFFFFF", AA_TEXT_CONTRAST)).toBe("#000000");
  });
  it("darkens/lightens a low-contrast color until it meets the target", () => {
    const repaired = repairForeground("#EEEEEE", "#FFFFFF", UI_MIN_CONTRAST);
    expect(repaired).not.toBeNull();
    expect(contrastRatio(repaired!, "#FFFFFF")).toBeGreaterThanOrEqual(UI_MIN_CONTRAST);
  });
  it("returns null for an invalid color", () => {
    expect(repairForeground("bad", "#FFFFFF", AA_TEXT_CONTRAST)).toBeNull();
  });
});

describe("ensureReadablePalette", () => {
  it("repairs a fixable palette so it validates", () => {
    // accent is far too light on white; text is fine.
    const proposed: BrandPalette = { primary: "#2563EB", accent: "#FFF6E5", background: "#FFFFFF", text: "#1A1A1A" };
    const fixed = ensureReadablePalette(proposed);
    expect(validatePalette(fixed).valid).toBe(true);
    expect(fixed.background).toBe("#FFFFFF");
    expect(fixed.text).toBe("#1A1A1A");
  });

  it("falls back to the given palette when a color is not a valid hex", () => {
    const fallback: BrandPalette = { primary: "#2563EB", accent: "#B45309", background: "#FFFFFF", text: "#1A1A1A" };
    const invalid = { primary: "#2563EB", accent: "#B45309", background: "not-a-hex", text: "#1A1A1A" } as BrandPalette;
    expect(ensureReadablePalette(invalid, fallback)).toEqual(fallback);
  });

  it("always returns a validating palette for a dark brand background", () => {
    const proposed: BrandPalette = { primary: "#7C3AED", accent: "#22D3EE", background: "#0B0713", text: "#ECEAF2" };
    expect(validatePalette(ensureReadablePalette(proposed)).valid).toBe(true);
  });
});
