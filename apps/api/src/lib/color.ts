import { converter, formatHex, parse, wcagContrast, wcagLuminance } from "culori";

const toOklch = converter("oklch");

const AA_NORMAL_TEXT = 4.5;
const AA_LARGE_TEXT = 3.0;

/** The 10-step scale every color token expands to, lightest to darkest. */
export const SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
export type ScaleStep = (typeof SCALE_STEPS)[number];
export type ColorScale = Record<ScaleStep, string>;

// Target OKLCH lightness per step. Chosen so 500 sits near the seed's own
// lightness and the scale spans near-white to near-black without clipping.
const LIGHTNESS_BY_STEP: Record<ScaleStep, number> = {
  50: 0.98,
  100: 0.95,
  200: 0.88,
  300: 0.78,
  400: 0.68,
  500: 0.58,
  600: 0.48,
  700: 0.38,
  800: 0.28,
  900: 0.18,
};

function toHex(l: number, c: number, h: number | undefined): string {
  return formatHex({ mode: "oklch", l, c, h });
}

/**
 * Expands one seed color into a 10-step scale by holding chroma/hue fixed
 * (from the seed) and sweeping lightness in OKLCH — perceptually uniform
 * steps regardless of hue, unlike sweeping HSL lightness.
 */
export function deriveColorScale(seedHex: string): ColorScale {
  const seed = toOklch(parse(seedHex));
  if (!seed) {
    throw new Error(`Invalid color: ${seedHex}`);
  }
  const chroma = seed.c ?? 0;
  const hue = seed.h;

  const scale = {} as ColorScale;
  for (const step of SCALE_STEPS) {
    // Chroma tapers slightly at the extremes so 50/900 don't oversaturate.
    const taper = step === 50 || step === 900 ? 0.6 : step === 100 || step === 800 ? 0.85 : 1;
    scale[step] = toHex(LIGHTNESS_BY_STEP[step], chroma * taper, hue);
  }
  return scale;
}

/** WCAG 2.x contrast ratio between two colors, 1–21. */
export function contrastRatio(hexA: string, hexB: string): number {
  const ratio = wcagContrast(hexA, hexB);
  if (ratio === undefined || Number.isNaN(ratio)) {
    throw new Error(`Could not compute contrast between ${hexA} and ${hexB}`);
  }
  return ratio;
}

export function meetsAA(ratio: number, isLargeText = false): boolean {
  return ratio >= (isLargeText ? AA_LARGE_TEXT : AA_NORMAL_TEXT);
}

/**
 * Nudges a foreground color's OKLCH lightness away from the background
 * until it passes WCAG AA, preserving its hue/chroma as much as possible.
 * Falls back to pure black/white if no in-hue adjustment clears the bar.
 */
export function ensureAccessibleForeground(fgHex: string, bgHex: string, isLargeText = false): string {
  if (meetsAA(contrastRatio(fgHex, bgHex), isLargeText)) {
    return fgHex;
  }

  const fg = toOklch(parse(fgHex));
  const bg = toOklch(parse(bgHex));
  if (!fg || !bg) {
    throw new Error(`Invalid color in pair: ${fgHex} / ${bgHex}`);
  }

  // Darkening or lightening the foreground both increase contrast against a
  // mid-tone background in one direction; try both and keep whichever wins.
  const goingDarker = bg.l >= 0.5;
  const step = goingDarker ? -0.02 : 0.02;
  let l = fg.l;
  for (let i = 0; i < 48; i++) {
    l = Math.max(0, Math.min(1, l + step));
    const candidate = toHex(l, fg.c ?? 0, fg.h);
    if (meetsAA(contrastRatio(candidate, bgHex), isLargeText)) {
      return candidate;
    }
    if (l === 0 || l === 1) break;
  }

  return goingDarker ? "#000000" : "#ffffff";
}

export interface ThemeColorTokens {
  primary: ColorScale;
  secondary: ColorScale;
  accent: ColorScale;
  surface: ColorScale;
  text: ColorScale;
  success: ColorScale;
  error: ColorScale;
}

const NEUTRAL_SURFACE_SEED = "#8a8a8a";
const SUCCESS_SEED = "#2f9e44";
const ERROR_SEED = "#e03131";

function rotateHue(seedHex: string, degrees: number): string {
  const seed = toOklch(parse(seedHex));
  if (!seed) {
    throw new Error(`Invalid color: ${seedHex}`);
  }
  const hue = ((seed.h ?? 0) + degrees + 360) % 360;
  return toHex(seed.l, seed.c ?? 0, hue);
}

/**
 * Given one brand seed color, derives the full accessible token set: the
 * brand hue for primary, a hue-rotated secondary/accent, a neutral surface
 * scale, and fixed semantic scales for success/error.
 */
export function derivePaletteFromSeed(seedHex: string): ThemeColorTokens {
  const primary = deriveColorScale(seedHex);
  const secondary = deriveColorScale(rotateHue(seedHex, 30));
  const accent = deriveColorScale(rotateHue(seedHex, -30));
  const surface = deriveColorScale(NEUTRAL_SURFACE_SEED);
  const text = deriveColorScale(NEUTRAL_SURFACE_SEED);
  const success = deriveColorScale(SUCCESS_SEED);
  const error = deriveColorScale(ERROR_SEED);

  // Every fg/bg pairing the design system actually uses is contrast-checked
  // at derivation time, with auto-adjustment if failing (§13) — not just
  // generated and hoped for. The two pairs used everywhere: a CTA button
  // (white text on primary[600]) and body copy (text[900] on surface[50]).
  primary[600] = ensureAccessibleForeground(primary[600], "#ffffff");
  text[900] = ensureAccessibleForeground(text[900], surface[50]);

  return { primary, secondary, accent, surface, text, success, error };
}

/**
 * WCAG relative luminance (0–1, in linear-light space — the same space
 * contrastRatio's underlying formula uses), not OKLCH lightness. Used to
 * size hero scrim overlays against a real image's measured brightness.
 */
export function relativeLuminance(hex: string): number {
  const luminance = wcagLuminance(hex);
  if (luminance === undefined || Number.isNaN(luminance)) {
    throw new Error(`Invalid color: ${hex}`);
  }
  return luminance;
}

/** Inverse sRGB transfer function: linear-light luminance -> gamma-encoded channel. */
function luminanceToSrgbChannel(luminance: number): number {
  const l = Math.max(0, Math.min(1, luminance));
  return l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
}

function grayHexFromLuminance(luminance: number): string {
  const channel = Math.round(luminanceToSrgbChannel(luminance) * 255);
  const clamped = Math.max(0, Math.min(255, channel)).toString(16).padStart(2, "0");
  return `#${clamped}${clamped}${clamped}`;
}

/**
 * Given a hero image's measured relative luminance (0–1, from
 * relativeLuminance / an upstream sampling step), returns the dark-scrim
 * opacity (0–1) needed so white overlay text clears WCAG AA. A black scrim
 * at opacity `o` composited over the image reduces linear luminance to
 * `luminance * (1 - o)` — solved by monotonic scan for the smallest opacity
 * where the resulting surface still passes.
 */
export function scrimOpacityForLuminance(luminance: number): number {
  for (let opacity = 0; opacity <= 1; opacity += 0.02) {
    const blendedLuminance = luminance * (1 - opacity);
    if (meetsAA(contrastRatio("#ffffff", grayHexFromLuminance(blendedLuminance)))) {
      return Math.round(opacity * 100) / 100;
    }
  }
  return 1;
}
