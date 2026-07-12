import type { GenerationStage, Prisma } from "@prisma/client";
import { waitUntil } from "@vercel/functions";
import { prisma } from "../../lib/prisma";
import { getAssetSummary } from "./asset-summary";
import { buildSiteDefinition } from "./assemble";
import { analyzeBrand } from "./brand-analysis";
import { adaptToneForVariation, generateContentCore } from "./content-generator";
import { ingestRestaurantData } from "./ingest";
import { scoreSiteDefinition } from "./scoring/score-aggregator";
import { THEME_CATALOG } from "./theme-catalog";
import { derivePaletteSeed, selectThemesForAllFamilies } from "./theme-matching";
import type { SiteDefinition, StyleFamilyValue, WebsiteScore } from "./types";

function toJson<T>(value: T): Prisma.InputJsonValue {
  return value as unknown as Prisma.InputJsonValue;
}

const FAMILIES: StyleFamilyValue[] = ["LUXURY", "MODERN", "MINIMAL"];

export interface GenerationJobRunner {
  /** jobId must already exist (created by generation.service.ts), mirroring ImportJobRunner's contract. */
  enqueue(jobId: string, siteId: string, batchId: string, createdById: string): void;
}

/**
 * The AI Website Generator orchestrator (§2). Runs in-process without
 * blocking the HTTP response — same seam as ImportJobRunner (job-runner.ts)
 * for swapping in a real queue later. Every AI-backed stage (brand
 * analysis, content generation, tone adaptation, the brand-consistency
 * LLM judge) already has a non-throwing safe-default fallback built into
 * its own module, so a full 3-variation batch is produced even if the LLM
 * is completely unavailable (acceptance criteria #16 and #18) — this
 * function only fails the whole batch on a genuine infrastructure error
 * (e.g. the database itself is unreachable), in which case there would be
 * nothing safe to persist anyway.
 *
 * `waitUntil` (not a bare `void`) — see job-runner.ts's identical
 * comment: Vercel's serverless runtime can freeze a function shortly
 * after its HTTP response is sent, pausing a detached promise mid-run
 * and never resuming it. `waitUntil` extends the invocation's lifetime
 * until this promise settles; off Vercel it's a no-op passthrough, so
 * behavior is unchanged there.
 */
class InProcessGenerationJobRunner implements GenerationJobRunner {
  enqueue(jobId: string, siteId: string, batchId: string, createdById: string): void {
    waitUntil(this.run(jobId, siteId, batchId, createdById));
  }

  private async run(jobId: string, siteId: string, batchId: string, createdById: string): Promise<void> {
    try {
      await prisma.generationJob.update({ where: { id: jobId }, data: { status: "RUNNING" } });

      const site = await prisma.site.findUniqueOrThrow({ where: { id: siteId } });
      const ingest = await ingestRestaurantData(site.restaurantId);

      await this.setStage(jobId, "BRAND_ANALYSIS");
      const brandProfile = await analyzeBrand(ingest);

      await this.setStage(jobId, "THEME_SELECTION");
      const themeSelection = selectThemesForAllFamilies(THEME_CATALOG, brandProfile, ingest.photoCount);

      await this.setStage(jobId, "CONTENT_GENERATION");
      const contentCore = await generateContentCore(ingest, brandProfile);

      await this.setStage(jobId, "ASSEMBLY");
      const assembled: { family: StyleFamilyValue; definition: SiteDefinition }[] = [];
      for (const family of FAMILIES) {
        const toneAdapted = await adaptToneForVariation(contentCore, family, ingest);
        const fit = themeSelection[family];
        const colorSeed = derivePaletteSeed(brandProfile, ingest.logoColorSeed, fit.theme.tokens.colorSeed);
        const definition = buildSiteDefinition({
          ingest,
          brandProfile,
          family,
          theme: fit.theme,
          content: toneAdapted,
          colorSeed,
          designRationale: fit.reasons,
        });
        assembled.push({ family, definition });
      }

      await this.setStage(jobId, "ASSETS");
      const assetSummary = await getAssetSummary(siteId);

      await this.setStage(jobId, "SCORING");
      const scored: { family: StyleFamilyValue; definition: SiteDefinition; score: WebsiteScore }[] = [];
      for (const { family, definition } of assembled) {
        const fit = themeSelection[family];
        const score = await scoreSiteDefinition(definition, { brandProfile, theme: fit.theme, assets: assetSummary });
        scored.push({ family, definition, score });
      }

      await this.setStage(jobId, "FINALIZE");
      await prisma.$transaction(async (tx) => {
        // Any variations left over from an earlier batch that weren't
        // selected are superseded by this fresh batch (§2a: "Regenerating
        // replaces the unselected variations only").
        await tx.siteVersion.updateMany({ where: { siteId, status: "VARIATION" }, data: { status: "ARCHIVED" } });

        const last = await tx.siteVersion.findFirst({ where: { siteId }, orderBy: { versionNo: "desc" } });
        let versionNo = last?.versionNo ?? 0;

        for (const { family, definition, score } of scored) {
          versionNo += 1;
          const created = await tx.siteVersion.create({
            data: {
              siteId,
              versionNo,
              definition: toJson(definition),
              status: "VARIATION",
              styleFamily: family,
              generationBatchId: batchId,
              createdById,
            },
          });
          await tx.siteScore.create({
            data: {
              siteVersionId: created.id,
              overall: score.overall,
              seo: score.seo,
              performance: score.performance,
              accessibility: score.accessibility,
              brandConsistency: score.brandConsistency,
              conversion: score.conversion,
              suggestions: toJson(score.suggestions),
              source: "AUTO",
            },
          });
        }

        await tx.site.update({ where: { id: siteId }, data: { brandProfile: toJson(brandProfile) } });
        await tx.generationJob.update({ where: { id: jobId }, data: { status: "COMPLETED", stage: "FINALIZE" } });
      });
    } catch (err) {
      await prisma.generationJob
        .update({
          where: { id: jobId },
          data: { status: "FAILED", error: err instanceof Error ? err.message : "Generation failed" },
        })
        .catch(() => undefined);
    }
  }

  private async setStage(jobId: string, stage: GenerationStage): Promise<void> {
    await prisma.generationJob.update({ where: { id: jobId }, data: { stage } });
  }
}

export const generationJobRunner: GenerationJobRunner = new InProcessGenerationJobRunner();
