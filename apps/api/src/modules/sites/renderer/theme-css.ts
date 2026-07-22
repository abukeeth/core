import { deriveColorScale, derivePaletteFromSeed, SCALE_STEPS } from "../../../lib/color";
import type { BrandSettings, StyleFamilyValue, ThemeCatalogEntry } from "../types";

/**
 * Storefront quality — Phase 1: distinct brand personalities from the SAME
 * components. The style family drives the display type feel (tracking, weight,
 * hero leading) and the section rhythm, so a LUXURY storefront reads tight and
 * editorial, MODERN reads bold and airy, and MINIMAL reads calm and warm —
 * without any per-theme component code.
 */
const PERSONALITY: Record<StyleFamilyValue, { tracking: string; weight: string; heroLeading: string; section: string }> = {
  LUXURY: { tracking: "-0.02em", weight: "600", heroLeading: "1.02", section: "clamp(4rem, 2rem + 7vw, 8rem)" },
  MODERN: { tracking: "-0.035em", weight: "700", heroLeading: "1.0", section: "clamp(3.25rem, 1.75rem + 6vw, 6.5rem)" },
  MINIMAL: { tracking: "-0.005em", weight: "600", heroLeading: "1.12", section: "clamp(2.75rem, 1.5rem + 5vw, 5.5rem)" },
};

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
  const persona = PERSONALITY[theme.styleFamily];

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
  --step-3: clamp(2.25rem, 1.4rem + 3.6vw, 3.75rem);
  --step-4: clamp(2.75rem, 1.3rem + 6.2vw, 5.75rem);
  --tracking-display: ${persona.tracking};
  --weight-display: ${persona.weight};
  --leading-hero: ${persona.heroLeading};
  --space-section: ${persona.section};
  --gutter: clamp(1.25rem, 0.5rem + 3vw, 3rem);
  --elevation: 0 1px 2px rgba(20,14,8,0.05), 0 20px 44px -18px rgba(20,14,8,0.24);
  --hairline: color-mix(in srgb, var(--color-text-900) 12%, transparent);
}
@media (prefers-reduced-motion: reduce) {
  :root { --motion-duration: 0ms; }
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
* { box-sizing: border-box; }
html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
body {
  margin: 0;
  font-family: var(--font-body);
  background: var(--color-surface-50);
  color: var(--color-text-900);
  font-size: var(--step-0);
  line-height: 1.65;
}
::selection { background: var(--color-accent-500); color: #fff; }
h1, h2, h3, h4 {
  font-family: var(--font-display);
  font-weight: var(--weight-display);
  line-height: 1.1;
  letter-spacing: var(--tracking-display);
  text-wrap: balance;
}
h1 { font-size: var(--step-4); line-height: var(--leading-hero); }
h2 { font-size: var(--step-3); }
h3 { font-size: var(--step-2); }
main { max-width: var(--page-width); margin: 0 auto; padding: 0 var(--gutter); }
p { max-width: 66ch; }
a { color: var(--color-primary-600); }
button, .cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--button-radius);
  background: var(--color-primary-600);
  color: #ffffff;
  padding: 0.85rem 1.75rem;
  text-decoration: none;
  border: none;
  font-size: var(--step-0);
  font-weight: 600;
  letter-spacing: 0.01em;
  min-height: 44px;
  min-width: 44px;
  box-shadow: var(--shadow);
  transition: transform var(--motion-duration) ease, box-shadow var(--motion-duration) ease, filter var(--motion-duration) ease;
}
.cta:hover, button:hover { transform: translateY(-1px); filter: brightness(1.04); }
.card {
  border-radius: var(--radius);
  box-shadow: var(--elevation);
}
.mobile-action-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 50;
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem;
  /* Clear the iOS home indicator so the buttons aren't half-hidden under it. */
  padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));
  background: var(--color-surface-100);
  border-top: 1px solid var(--color-surface-300);
}
@media (min-width: 768px) {
  .mobile-action-bar { display: none; }
}
/* The fixed action bar is only shown on mobile — reserve space at the bottom
   of the page (plus the safe-area inset) so the footer and last section
   aren't permanently hidden behind it and the page scrolls fully. */
@media (max-width: 767px) {
  body { padding-bottom: calc(64px + env(safe-area-inset-bottom)); }
}
img { max-width: 100%; height: auto; }
section { padding: var(--content-spacing) 0; }
</style>`;
}
