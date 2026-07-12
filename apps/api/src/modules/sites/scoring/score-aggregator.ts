import type { AssetSummary, BrandProfile, DimensionScore, SiteDefinition, Suggestion, ThemeCatalogEntry, WebsiteScore } from "../types";
import { scoreAccessibility } from "./accessibility-score";
import { scoreBrandConsistency } from "./brand-consistency-score";
import { scoreConversion } from "./conversion-score";
import { scorePerformance } from "./performance-score";
import { scoreSeo } from "./seo-score";

export interface ScoringContext {
  brandProfile: BrandProfile;
  theme: ThemeCatalogEntry;
  assets: AssetSummary;
}

const IMPACT_RANK: Record<Suggestion["impact"], number> = { high: 0, medium: 1, low: 2 };

/**
 * Combines the five dimensions (§2c) into one WebsiteScore. Weighting is
 * equal (20% each) — the spec doesn't prescribe exact weights, and equal
 * weighting avoids silently telling owners one dimension matters more than
 * another. Suggestions are pooled and ranked by impact across dimensions.
 */
export async function scoreSiteDefinition(definition: SiteDefinition, context: ScoringContext): Promise<WebsiteScore> {
  const seo = scoreSeo(definition, context.assets);
  const performance = scorePerformance(definition, context.assets);
  const accessibility = scoreAccessibility(definition, context.assets);
  const conversion = scoreConversion(definition);
  const brandConsistency = await scoreBrandConsistency(definition, context.brandProfile, context.theme);

  const dimensions: DimensionScore[] = [seo, performance, accessibility, brandConsistency, conversion];
  const overall = Math.round(dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length);
  const suggestions = dimensions.flatMap((d) => d.suggestions).sort((a, b) => IMPACT_RANK[a.impact] - IMPACT_RANK[b.impact]);

  return {
    overall,
    seo: seo.score,
    performance: performance.score,
    accessibility: accessibility.score,
    brandConsistency: brandConsistency.score,
    conversion: conversion.score,
    suggestions,
  };
}
