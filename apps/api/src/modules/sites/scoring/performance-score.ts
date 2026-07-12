import type { AssetSummary, DimensionScore, SiteDefinition, Suggestion } from "../types";

const SECTION_BUDGET = 30;

/**
 * Performance score (§2c row 2) — the spec calls for a real Lighthouse (or
 * equivalent lab) run against the rendered variation. This sandbox has no
 * live renderer/CDN to run Lighthouse against (see RELEASE_NOTES.md Known
 * Limitations), so this is a **documented heuristic stand-in**: it checks
 * structural signals we can actually measure from the SiteDefinition and
 * asset metadata (image processing coverage, total section count as a
 * payload proxy) and treats the fixed, JS-light static component library
 * as a constant pass for what would otherwise need a real bundle/LCP
 * measurement. Swapping this function's body for a real Lighthouse runner
 * later requires no change to its callers — same seam as fileStorage/
 * safeFetch's swappable-interface pattern elsewhere in this codebase.
 */
export function scorePerformance(definition: SiteDefinition, assets: AssetSummary): DimensionScore {
  let score = 100;
  const suggestions: Suggestion[] = [];

  if (assets.totalPhotoAssets > 0 && assets.unprocessedRenditionsCount > 0) {
    score -= Math.min(30, assets.unprocessedRenditionsCount * 5);
    suggestions.push({
      id: "performance:unprocessed-images",
      dimension: "performance",
      issue: `${assets.unprocessedRenditionsCount} image(s) haven't been processed into responsive renditions`,
      impact: "high",
      suggestion: "Re-upload or reprocess images so they get AVIF/WebP renditions at every breakpoint.",
    });
  }

  const totalSections = definition.pages.reduce((sum, page) => sum + page.sections.length, 0);
  if (totalSections > SECTION_BUDGET) {
    score -= 10;
    suggestions.push({
      id: "performance:section-count",
      dimension: "performance",
      issue: `${totalSections} total sections across all pages exceeds the recommended budget of ${SECTION_BUDGET}`,
      impact: "low",
      suggestion: "Trim or hide low-value sections to keep page weight down.",
    });
  }

  return { dimension: "performance", score: Math.max(0, Math.round(score)), suggestions };
}
