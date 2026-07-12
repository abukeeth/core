import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  derivePaletteFromSeed,
  deriveColorScale,
  ensureAccessibleForeground,
  meetsAA,
  SCALE_STEPS,
  scrimOpacityForLuminance,
} from "./color";

describe("deriveColorScale", () => {
  it("produces all 10 steps as valid hex colors", () => {
    const scale = deriveColorScale("#2f6f4f");
    for (const step of SCALE_STEPS) {
      expect(scale[step]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("is monotonically darker from step 50 to step 900", () => {
    const scale = deriveColorScale("#2f6f4f");
    const contrastAgainstBlack = (hex: string) => contrastRatio(hex, "#000000");
    // Step 50 is near-white (high contrast vs black); step 900 is near-black
    // (low contrast vs black) — contrast against black should decrease
    // monotonically as the step number increases.
    for (let i = 1; i < SCALE_STEPS.length; i++) {
      const previous = contrastAgainstBlack(scale[SCALE_STEPS[i - 1]]);
      const current = contrastAgainstBlack(scale[SCALE_STEPS[i]]);
      expect(current).toBeLessThanOrEqual(previous);
    }
  });

  it("throws on an invalid color string", () => {
    expect(() => deriveColorScale("not-a-color")).toThrow();
  });
});

describe("contrastRatio / meetsAA", () => {
  it("gives black-on-white the maximum ratio", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("gives identical colors a ratio of 1", () => {
    expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1, 5);
  });

  it("flags a ratio above 4.5 as meeting AA for normal text", () => {
    expect(meetsAA(4.6)).toBe(true);
    expect(meetsAA(4.4)).toBe(false);
  });

  it("uses the lower 3.0 threshold for large text", () => {
    expect(meetsAA(3.2, true)).toBe(true);
    expect(meetsAA(2.9, true)).toBe(false);
  });
});

describe("ensureAccessibleForeground", () => {
  it("returns the original color unchanged when it already passes AA", () => {
    expect(ensureAccessibleForeground("#000000", "#ffffff")).toBe("#000000");
  });

  it("adjusts a failing pair until it passes AA", () => {
    const bg = "#7a7a7a";
    const fg = "#8a8a8a"; // near-identical gray, fails contrast against bg
    const fixed = ensureAccessibleForeground(fg, bg);
    expect(meetsAA(contrastRatio(fixed, bg))).toBe(true);
  });

  it("never returns a pair that still fails AA", () => {
    const cases: [string, string][] = [
      ["#ff0000", "#ff4d4d"],
      ["#cccccc", "#dddddd"],
      ["#123456", "#1a3f6b"],
    ];
    for (const [fg, bg] of cases) {
      const fixed = ensureAccessibleForeground(fg, bg);
      expect(meetsAA(contrastRatio(fixed, bg))).toBe(true);
    }
  });
});

describe("derivePaletteFromSeed", () => {
  it("returns a scale for every required token", () => {
    const palette = derivePaletteFromSeed("#8b2f2f");
    for (const key of ["primary", "secondary", "accent", "surface", "text", "success", "error"] as const) {
      expect(palette[key][500]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("is deterministic — same seed produces the same palette", () => {
    const a = derivePaletteFromSeed("#274690");
    const b = derivePaletteFromSeed("#274690");
    expect(a).toEqual(b);
  });

  it("gives secondary and accent a different hue than primary", () => {
    const palette = derivePaletteFromSeed("#274690");
    expect(palette.secondary[500]).not.toBe(palette.primary[500]);
    expect(palette.accent[500]).not.toBe(palette.primary[500]);
  });

  it("guarantees the CTA button pairing (white text on primary-600) passes AA for any seed", () => {
    // Includes seeds that would fail without the auto-adjustment in
    // derivePaletteFromSeed — e.g. a light, low-chroma yellow.
    for (const seed of ["#f5e050", "#8b2f2f", "#1a1a1a", "#00ff00", "#ffddaa"]) {
      const palette = derivePaletteFromSeed(seed);
      expect(meetsAA(contrastRatio("#ffffff", palette.primary[600]))).toBe(true);
    }
  });

  it("guarantees the body-text pairing (text-900 on surface-50) passes AA", () => {
    const palette = derivePaletteFromSeed("#274690");
    expect(meetsAA(contrastRatio(palette.text[900], palette.surface[50]))).toBe(true);
  });
});

describe("scrimOpacityForLuminance", () => {
  it("requires little to no scrim for an already-dark image", () => {
    expect(scrimOpacityForLuminance(0.05)).toBeLessThan(0.1);
  });

  it("requires a stronger scrim for a bright image than a dark one", () => {
    expect(scrimOpacityForLuminance(0.95)).toBeGreaterThan(scrimOpacityForLuminance(0.05));
  });

  it("always returns an opacity where white text passes AA", () => {
    for (const luminance of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
      const opacity = scrimOpacityForLuminance(luminance);
      const blendedLuminance = luminance * (1 - opacity);
      // Same linear-luminance -> sRGB gray conversion the implementation uses.
      const channel = blendedLuminance <= 0.0031308 ? blendedLuminance * 12.92 : 1.055 * blendedLuminance ** (1 / 2.4) - 0.055;
      const hexChannel = Math.round(Math.max(0, Math.min(1, channel)) * 255)
        .toString(16)
        .padStart(2, "0");
      const blendedHex = `#${hexChannel}${hexChannel}${hexChannel}`;
      expect(meetsAA(contrastRatio("#ffffff", blendedHex))).toBe(true);
    }
  });
});
