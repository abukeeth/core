import type { Prisma, SiteScore, SiteVersion } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { autoFillMissingAltText } from "./asset.service";
import { getAssetSummary } from "./asset-summary";
import { applyDefinitionSuggestionFix } from "./scoring/apply-suggestion";
import { NEUTRAL_BRAND_PROFILE_FOR_SCORING } from "./scoring/neutral-brand-profile";
import { scoreSiteDefinition } from "./scoring/score-aggregator";
import { SiteVersionNotFoundError, SuggestionNotFoundError } from "./site.errors";
import { getOwnSiteById } from "./site.service";
import { THEME_CATALOG } from "./theme-catalog";
import { brandProfileSchema, siteDefinitionSchema, type Suggestion } from "./types";

function toJson<T>(value: T): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

async function findOwnVersion(siteId: string, versionId: string): Promise<SiteVersion> {
  const version = await prisma.siteVersion.findUnique({ where: { id: versionId } });
  if (!version || version.siteId !== siteId) {
    throw new SiteVersionNotFoundError();
  }
  return version;
}

/** POST /api/sites/:id/versions/:vid/score — runs/refreshes the AI Website Score on demand. */
export async function runScore(restaurantId: string, siteId: string, versionId: string): Promise<SiteScore> {
  const site = await getOwnSiteById(restaurantId, siteId);
  const version = await findOwnVersion(site.id, versionId);
  const definition = siteDefinitionSchema.parse(version.definition);

  const theme = THEME_CATALOG.find((t) => t.key === definition.themeKey && t.version === definition.themeVersion);
  if (!theme) {
    throw new Error(`Unknown theme "${definition.themeKey}" v${definition.themeVersion}`);
  }
  const brandProfile = site.brandProfile ? brandProfileSchema.parse(site.brandProfile) : NEUTRAL_BRAND_PROFILE_FOR_SCORING;
  const assets = await getAssetSummary(site.id);

  const result = await scoreSiteDefinition(definition, { brandProfile, theme, assets });

  return prisma.siteScore.create({
    data: {
      siteVersionId: version.id,
      overall: result.overall,
      seo: result.seo,
      performance: result.performance,
      accessibility: result.accessibility,
      brandConsistency: result.brandConsistency,
      conversion: result.conversion,
      suggestions: toJson(result.suggestions),
      source: "MANUAL",
    },
  });
}

/** GET /api/sites/:id/versions/:vid/score — latest score + suggestions. */
export async function getLatestScore(restaurantId: string, siteId: string, versionId: string): Promise<SiteScore | null> {
  const site = await getOwnSiteById(restaurantId, siteId);
  await findOwnVersion(site.id, versionId);
  return prisma.siteScore.findFirst({ where: { siteVersionId: versionId }, orderBy: { measuredAt: "desc" } });
}

/** GET score history (sparkline) for a version. */
export async function getScoreHistory(restaurantId: string, siteId: string, versionId: string): Promise<SiteScore[]> {
  const site = await getOwnSiteById(restaurantId, siteId);
  await findOwnVersion(site.id, versionId);
  return prisma.siteScore.findMany({ where: { siteVersionId: versionId }, orderBy: { measuredAt: "asc" } });
}

/**
 * POST /api/sites/:id/suggestions/:sid/apply — one-click auto-fix.
 * "missingAltText" is dispatched to the asset layer (alt text lives on
 * SiteAsset rows); every other autoFixKind mutates the draft SiteDefinition
 * via apply-suggestion.ts. Re-scores afterward so the caller can see the
 * fix actually moved the score (acceptance criterion #7).
 */
export async function applySuggestion(restaurantId: string, siteId: string, versionId: string, suggestion: Suggestion): Promise<SiteScore> {
  const site = await getOwnSiteById(restaurantId, siteId);
  const version = await findOwnVersion(site.id, versionId);

  if (!suggestion.autoFixKind) {
    throw new SuggestionNotFoundError();
  }

  if (suggestion.autoFixKind === "missingAltText") {
    await autoFillMissingAltText(restaurantId, siteId);
  } else {
    const definition = siteDefinitionSchema.parse(version.definition);
    const fixed = applyDefinitionSuggestionFix(definition, suggestion);
    await prisma.siteVersion.update({ where: { id: version.id }, data: { definition: toJson(fixed) } });
  }

  return runScore(restaurantId, siteId, versionId);
}
