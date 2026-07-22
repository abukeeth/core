import type { BusinessType } from "@prisma/client";
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
  /** The tenant's structured business type — drives the vertical-fit bonus below. Optional so callers that don't know it are unaffected. */
  businessType?: BusinessType;
}

const IMPACT_RANK: Record<Suggestion["impact"], number> = { high: 0, medium: 1, low: 2 };

/**
 * Vertical-fit bonus: a theme purpose-built for the tenant's business type
 * (e.g. `vape-vapor` for VAPE_SHOP) gets a bounded boost so it becomes the
 * recommended storefront ahead of a generic theme that happens to score a
 * point or two higher on generic metrics. Additive + clamped, so a genuinely
 * broken vertical theme (a deficit larger than the bonus) still loses — the
 * "unless a major quality issue" escape hatch is preserved.
 */
const VERTICAL_FIT_BONUS = 8;

function verticalFitBonus(context: ScoringContext): number {
  const matched = context.businessType !== undefined && (context.theme.businessTypes?.includes(context.businessType) ?? false);
  return matched ? VERTICAL_FIT_BONUS : 0;
}

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
  const base = Math.round(dimensions.reduce((sum, d) => sum + d.score, 0) / dimensions.length);
  const overall = Math.min(100, base + verticalFitBonus(context));
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
