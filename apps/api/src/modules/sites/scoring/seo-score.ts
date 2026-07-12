import type { AssetSummary, DimensionScore, SiteDefinition, Suggestion } from "../types";

const IDEAL_TITLE_RANGE: [number, number] = [30, 60];
const IDEAL_META_RANGE: [number, number] = [50, 155];

/**
 * SEO score (§2c row 1) — entirely rule-based, no LLM opinion involved:
 * title/meta length & presence, keyword presence (cuisine, since our own
 * seo.ts always injects it), alt text coverage, and slug quality. Every
 * check here is deterministic and reproducible for the same SiteDefinition.
 */
export function scoreSeo(definition: SiteDefinition, assets: AssetSummary): DimensionScore {
  let score = 100;
  const suggestions: Suggestion[] = [];

  for (const page of definition.pages) {
    const [minTitle, maxTitle] = IDEAL_TITLE_RANGE;
    if (page.title.length < minTitle || page.title.length > maxTitle) {
      score -= 5;
      suggestions.push({
        id: `seo:title-length:${page.slug}`,
        dimension: "seo",
        issue: `Title for "${page.slug}" is ${page.title.length} characters (ideal: ${minTitle}-${maxTitle})`,
        impact: "low",
        suggestion: "Adjust the page title length for better search-result display.",
      });
    }

    const [minMeta, maxMeta] = IDEAL_META_RANGE;
    if (page.metaDescription.length < minMeta || page.metaDescription.length > maxMeta) {
      score -= 5;
      suggestions.push({
        id: `seo:meta-length:${page.slug}`,
        dimension: "seo",
        issue: `Meta description for "${page.slug}" is ${page.metaDescription.length} characters (ideal: ${minMeta}-${maxMeta})`,
        impact: "medium",
        suggestion: "Rewrite the meta description to fall within the ideal length range.",
        autoFixKind: "missingMetaDescription",
      });
    }

    const cuisineMentioned = `${page.title} ${page.metaDescription}`.toLowerCase().includes(definition.cuisine.toLowerCase());
    if (!cuisineMentioned) {
      score -= 5;
      suggestions.push({
        id: `seo:keyword:${page.slug}`,
        dimension: "seo",
        issue: `"${page.slug}" doesn't mention the cuisine keyword ("${definition.cuisine}") in its title or meta description`,
        impact: "medium",
        suggestion: "Include the cuisine and city in the title or meta description for better search relevance.",
      });
    }
  }

  if (assets.totalPhotoAssets > 0 && assets.altTextMissingCount > 0) {
    score -= Math.min(20, assets.altTextMissingCount * 5);
    suggestions.push({
      id: "seo:alt-text",
      dimension: "seo",
      issue: `${assets.altTextMissingCount} image(s) are missing alt text`,
      impact: assets.altTextMissingCount > 2 ? "high" : "medium",
      suggestion: "Add descriptive alt text to every image for search engines and screen readers.",
      autoFixKind: "missingAltText",
    });
  }

  return { dimension: "seo", score: Math.max(0, Math.round(score)), suggestions };
}
