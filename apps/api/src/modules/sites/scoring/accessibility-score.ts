import type { AssetSummary, DimensionScore, SiteDefinition, Suggestion } from "../types";

/**
 * Accessibility score (§2c row 3). Body-text and CTA-button contrast are
 * NOT scored here as a variable risk: lib/color.ts's derivePaletteFromSeed
 * auto-adjusts both of those pairings to guarantee AA at derivation time
 * (§13), so they can't actually fail for a generated site — scoring them
 * here would be a dead check that always reads 100. The genuinely
 * variable risk is hero overlay text against a real photo, which the
 * palette guarantee can't cover (photos aren't color tokens), plus alt
 * text coverage. Touch targets, focus order, and reduced-motion are
 * guaranteed by the shared component library (§16/§17) rather than
 * varying per site, so they contribute a fixed structural pass here,
 * documented rather than silently assumed. A live axe-core scan against
 * the rendered public site (once one exists) would replace this file.
 */
export function scoreAccessibility(definition: SiteDefinition, assets: AssetSummary): DimensionScore {
  let score = 100;
  const suggestions: Suggestion[] = [];

  const heroSections = definition.pages.flatMap((page) => page.sections.filter((section) => section.type === "hero"));
  for (const hero of heroSections) {
    const luminance = typeof hero.props.heroImageLuminance === "number" ? hero.props.heroImageLuminance : undefined;
    const scrimOpacity = typeof hero.props.scrimOpacity === "number" ? hero.props.scrimOpacity : 0;
    if (luminance !== undefined) {
      const blendedLuminance = luminance * (1 - scrimOpacity);
      const approxRatio = 1 + (1 - blendedLuminance) * 20; // monotonic proxy, not the real formula
      if (blendedLuminance > 0.6 && scrimOpacity < 0.3) {
        score -= 15;
        suggestions.push({
          id: "accessibility:hero-contrast",
          dimension: "accessibility",
          issue: `Hero overlay text may not meet WCAG AA against a bright image (approx. ratio ${approxRatio.toFixed(1)}:1)`,
          impact: "high",
          suggestion: "Increase the hero scrim overlay so headline text stays readable.",
          autoFixKind: "heroContrast",
        });
      }
    }
  }

  if (assets.totalPhotoAssets > 0 && assets.altTextMissingCount > 0) {
    score -= Math.min(15, assets.altTextMissingCount * 3);
    suggestions.push({
      id: "accessibility:alt-text",
      dimension: "accessibility",
      issue: `${assets.altTextMissingCount} image(s) are missing alt text for screen readers`,
      impact: "high",
      suggestion: "Add descriptive alt text to every image.",
      autoFixKind: "missingAltText",
    });
  }

  return { dimension: "accessibility", score: Math.max(0, Math.round(score)), suggestions };
}
