import type { BrandPalette } from "./brand-kit";

/**
 * Sprint 5.5 — WCAG contrast validation + automatic repair for Brand-Kit
 * palettes. Because color is now fully AI-owned (per business), a proposed
 * palette must be proven readable before it drives the storefront: text on
 * background must meet AA (4.5:1); accent and primary must stay distinguishable
 * from the background (3:1). Unreadable colors are repaired by shifting
 * lightness toward the higher-contrast extreme; if text still can't be fixed,
 * the whole palette falls back to a guaranteed-valid one.
 */

export const AA_TEXT_CONTRAST = 4.5;
export const UI_MIN_CONTRAST = 3.0;

/** Ultimate floor — a guaranteed-valid neutral palette. */
export const SAFE_DEFAULT_PALETTE: BrandPalette = {
  primary: "#2563EB",
  accent: "#B45309",
  background: "#FFFFFF",
  text: "#1A1A1A",
};

interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): Rgb | null {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return null;
  const int = parseInt(match[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const to2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`.toUpperCase();
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * srgbToLinear(rgb.r) + 0.7152 * srgbToLinear(rgb.g) + 0.0722 * srgbToLinear(rgb.b);
}

/** WCAG contrast ratio between two hex colors (1..21). Returns 1 for invalid input. */
export function contrastRatio(hexA: string, hexB: string): number {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return 1;
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// --- HSL helpers (for lightness-based repair) ---
function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h / 6, s, l };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

/**
 * Adjust a foreground color's lightness (keeping hue/saturation) until it meets
 * `target` contrast against `background`. Moves toward whichever extreme (white
 * or black) contrasts better with the background. Returns the repaired hex, or
 * `null` if no lightness reaches the target.
 */
export function repairForeground(foreground: string, background: string, target: number): string | null {
  if (contrastRatio(foreground, background) >= target) return foreground;
  const fgRgb = hexToRgb(foreground);
  if (!fgRgb) return null;

  const lighten = contrastRatio("#FFFFFF", background) >= contrastRatio("#000000", background);
  const { h, s } = rgbToHsl(fgRgb);
  const STEP = 0.04;
  for (let i = 1; i <= 25; i++) {
    const l = lighten ? Math.min(1, i * STEP) : Math.max(0, 1 - i * STEP);
    const candidate = rgbToHex(hslToRgb(h, s, l));
    if (contrastRatio(candidate, background) >= target) return candidate;
    if (l === 0 || l === 1) break;
  }
  return null;
}

export interface PaletteValidation {
  valid: boolean;
  issues: string[];
}

/** Validate a palette against AA text contrast and UI-minimum accent/primary contrast. */
export function validatePalette(palette: BrandPalette): PaletteValidation {
  const issues: string[] = [];
  if (contrastRatio(palette.text, palette.background) < AA_TEXT_CONTRAST) {
    issues.push("text/background below AA (4.5:1)");
  }
  if (contrastRatio(palette.accent, palette.background) < UI_MIN_CONTRAST) {
    issues.push("accent/background below 3:1");
  }
  if (contrastRatio(palette.primary, palette.background) < UI_MIN_CONTRAST) {
    issues.push("primary/background below 3:1");
  }
  return { valid: issues.length === 0, issues };
}

/**
 * Return a palette guaranteed to be readable: repair text (AA), accent and
 * primary (UI-min) against the background. If text can't be repaired (e.g. a
 * mid-tone background where no lightness reaches AA), return `fallback` whole.
 */
export function ensureReadablePalette(proposed: BrandPalette, fallback: BrandPalette = SAFE_DEFAULT_PALETTE): BrandPalette {
  if (!hexToRgb(proposed.background) || !hexToRgb(proposed.text)) return fallback;

  const text = repairForeground(proposed.text, proposed.background, AA_TEXT_CONTRAST);
  if (!text) return fallback;

  const accent = repairForeground(proposed.accent, proposed.background, UI_MIN_CONTRAST) ?? fallback.accent;
  const primary = repairForeground(proposed.primary, proposed.background, UI_MIN_CONTRAST) ?? fallback.primary;

  return { ...proposed, text, accent, primary };
}
