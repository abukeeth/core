import { randomUUID } from "node:crypto";
import type { GenerationJob, SiteVersion } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { generationJobRunner } from "./generator";
import { SiteNotFoundError, VariationNotFoundError } from "./site.errors";

async function findOwnSite(restaurantId: string, siteId: string) {
  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site || site.restaurantId !== restaurantId) {
    throw new SiteNotFoundError();
  }
  return site;
}

/** POST /api/sites/:id/generate — kicks off a fresh 3-variation batch. */
export async function startGeneration(restaurantId: string, siteId: string, createdById: string): Promise<GenerationJob> {
  const site = await findOwnSite(restaurantId, siteId);
  const batchId = randomUUID();
  const job = await prisma.generationJob.create({
    data: { siteId: site.id, batchId, stage: "INGEST", status: "PENDING" },
  });
  generationJobRunner.enqueue(job.id, site.id, batchId, createdById);
  return job;
}

/** GET /api/sites/:id/generation — latest job's status/progress. */
export async function getGenerationStatus(restaurantId: string, siteId: string): Promise<GenerationJob | null> {
  await findOwnSite(restaurantId, siteId);
  return prisma.generationJob.findFirst({ where: { siteId }, orderBy: { createdAt: "desc" } });
}

/** GET /api/sites/:id/variations — the current batch's picker options + scores. */
export async function listVariations(restaurantId: string, siteId: string) {
  await findOwnSite(restaurantId, siteId);
  return prisma.siteVersion.findMany({
    where: { siteId, status: "VARIATION" },
    include: { scores: { orderBy: { measuredAt: "desc" }, take: 1 } },
    orderBy: { versionNo: "desc" },
  });
}

/** POST /api/sites/:id/variations/:vid/select — promotes one variation to the active draft. */
export async function selectVariation(restaurantId: string, siteId: string, versionId: string): Promise<SiteVersion> {
  const site = await findOwnSite(restaurantId, siteId);
  const version = await prisma.siteVersion.findUnique({ where: { id: versionId } });
  if (!version || version.siteId !== site.id || version.status !== "VARIATION") {
    throw new VariationNotFoundError();
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.siteVersion.update({ where: { id: version.id }, data: { status: "DRAFT" } });
    await tx.site.update({ where: { id: site.id }, data: { status: "DRAFT" } });
    return updated;
  });
}

/**
 * POST /api/sites/:id/variations/regenerate — a fresh batch, same pipeline
 * as startGeneration. generator.ts only archives rows still in VARIATION
 * status, so an already-selected DRAFT is untouched (§2a: "Regenerating
 * replaces the unselected variations only").
 */
export async function regenerateVariations(restaurantId: string, siteId: string, createdById: string): Promise<GenerationJob> {
  return startGeneration(restaurantId, siteId, createdById);
}
