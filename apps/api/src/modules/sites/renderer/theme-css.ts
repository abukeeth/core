import { deriveColorScale, derivePaletteFromSeed, SCALE_STEPS } from "../../../lib/color";
import type { BrandSettings, ThemeCatalogEntry } from "../types";

const RADIUS_PX: Record<ThemeCatalogEntry["tokens"]["radius"], string> = {
  sharp: "2px",
  soft: "8px",
  rounded: "16px",
};

const MOTION_DURATION: Record<ThemeCatalogEntry["tokens"]["motion"], string> = {
  none: "0ms",
  subtle: "150ms",
  energetic: "300ms",
};

const PAGE_WIDTH_PX: Record<NonNullable<BrandSettings["pageWidth"]>, string> = {
  narrow: "800px",
  standard: "1200px",
  wide: "1440px",
  full: "100%",
};

const CONTENT_SPACING_REM: Record<NonNullable<BrandSettings["contentSpacing"]>, string> = {
  compact: "1rem",
  comfortable: "2rem",
  spacious: "3.5rem",
};

const SHADOW_VALUE: Record<NonNullable<BrandSettings["shadowIntensity"]>, string> = {
  none: "none",
  soft: "0 2px 8px rgba(0,0,0,0.08)",
  medium: "0 6px 20px rgba(0,0,0,0.14)",
  strong: "0 12px 32px rgba(0,0,0,0.22)",
};

/**
 * Compiles theme tokens to CSS custom properties (§1, §13, §14) — every
 * component in components/*.ts reads only these variables, never a
 * hard-coded value, so any theme x any content combination renders
 * correctly. Also emits `prefers-reduced-motion` handling (§17).
 *
 * Sprint 20A Task 5 — `brandSettings` layers individually-set overrides on
 * top of the theme's normal seed-derived palette; every field is optional,
 * so a definition with no `brandSettings` produces byte-identical CSS to
 * before this task (§9 "safe defaults for existing sites").
 */
export function renderThemeCss(theme: ThemeCatalogEntry, colorSeed: string, brandSettings?: BrandSettings): string {
  const palette = derivePaletteFromSeed(colorSeed);
  if (brandSettings?.primaryColor) palette.primary = deriveColorScale(brandSettings.primaryColor);
  if (brandSettings?.secondaryColor) palette.secondary = deriveColorScale(brandSettings.secondaryColor);
  if (brandSettings?.accentColor) palette.accent = deriveColorScale(brandSettings.accentColor);

  const colorVars = (Object.keys(palette) as (keyof typeof palette)[])
    .flatMap((token) => SCALE_STEPS.map((step) => `--color-${token}-${step}: ${palette[token][step]};`))
    .join("\n  ");

  const backgroundOverride = brandSettings?.backgroundColor ? `--color-surface-50: ${brandSettings.backgroundColor};` : "";
  const textOverride = brandSettings?.textColor ? `--color-text-900: ${brandSettings.textColor};` : "";

  const radius = brandSettings?.borderRadius !== undefined ? `${brandSettings.borderRadius}px` : RADIUS_PX[theme.tokens.radius];
  const buttonRadius = brandSettings?.buttonStyle === "pill" ? "999px" : brandSettings?.buttonStyle === "square" ? "0px" : radius;
  const shadow = SHADOW_VALUE[brandSettings?.shadowIntensity ?? "none"];
  const pageWidth = PAGE_WIDTH_PX[brandSettings?.pageWidth ?? "standard"];
  const contentSpacing = CONTENT_SPACING_REM[brandSettings?.contentSpacing ?? "comfortable"];
  const headingFont = brandSettings?.headingFont ?? theme.tokens.typography.display;
  const bodyFont = brandSettings?.bodyFont ?? theme.tokens.typography.body;

  return `<style>
:root {
  ${colorVars}
  ${backgroundOverride}
  ${textOverride}
  --font-display: "${headingFont}", serif;
  --font-body: "${bodyFont}", sans-serif;
  --radius: ${radius};
  --button-radius: ${buttonRadius};
  --shadow: ${shadow};
  --page-width: ${pageWidth};
  --content-spacing: ${contentSpacing};
  --motion-duration: ${MOTION_DURATION[theme.tokens.motion]};
  --type-scale-ratio: ${theme.tokens.typeScaleRatio};
  --step--1: clamp(0.8rem, 0.75rem + 0.25vw, 0.9rem);
  --step-0: clamp(1rem, 0.95rem + 0.25vw, 1.125rem);
  --step-1: clamp(calc(1rem * var(--type-scale-ratio)), 1.2rem + 1vw, calc(1.4rem * var(--type-scale-ratio)));
  --step-2: clamp(calc(1rem * var(--type-scale-ratio) * var(--type-scale-ratio)), 1.6rem + 2vw, calc(2rem * var(--type-scale-ratio) * var(--type-scale-ratio)));
}
@media (prefers-reduced-motion: reduce) {
  :root { --motion-duration: 0ms; }
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: var(--font-body);
  background: var(--color-surface-50);
  color: var(--color-text-900);
  font-size: var(--step-0);
  line-height: 1.6;
}
h1, h2, h3 { font-family: var(--font-display); line-height: 1.2; }
h1 { font-size: var(--step-2); }
h2 { font-size: var(--step-1); }
main { max-width: var(--page-width); margin: 0 auto; padding: 0 1rem; }
p { max-width: 70ch; }
a { color: var(--color-primary-600); }
button, .cta {
  display: inline-block;
  border-radius: var(--button-radius);
  background: var(--color-primary-600);
  color: #ffffff;
  padding: 0.75rem 1.5rem;
  text-decoration: none;
  border: none;
  font-size: var(--step-0);
  min-height: 44px;
  min-width: 44px;
  box-shadow: var(--shadow);
}
.card {
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.mobile-action-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem;
  background: var(--color-surface-100);
  border-top: 1px solid var(--color-surface-300);
}
@media (min-width: 768px) {
  .mobile-action-bar { display: none; }
}
img { max-width: 100%; height: auto; }
section { padding: var(--content-spacing) 0; }
</style>`;
}
