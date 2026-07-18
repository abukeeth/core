import { randomUUID } from "node:crypto";
import type { GenerationJob, GenerationStatus, Prisma, SiteVersion } from "@prisma/client";
import { MAX_ATTEMPTS, staleCutoff, type ReapResult } from "../../lib/job-durability";
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
    // createdById persisted (§Job Durability) so a reaper re-enqueue can
    // attribute the retried batch to the same owner without a request context.
    data: { siteId: site.id, batchId, stage: "INGEST", status: "PENDING", createdById },
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
    // Single-draft invariant: switching themes (selecting a different
    // variation) demotes the previously-selected draft back to VARIATION
    // first, so there is always exactly one DRAFT. Without this, repeatedly
    // selecting variations left multiple DRAFTs and getActiveDraft's
    // highest-versionNo tiebreak could publish a theme the owner didn't
    // pick. The demoted version keeps its definition, so it remains a
    // fully-previewable option in the theme switcher.
    await tx.siteVersion.updateMany({ where: { siteId: site.id, status: "DRAFT" }, data: { status: "VARIATION" } });
    const updated = await tx.siteVersion.update({ where: { id: version.id }, data: { status: "DRAFT" } });
    // previewApprovedAt cleared: selecting a (possibly different) design
    // means any prior approval was for a different draft and no longer applies.
    await tx.site.update({ where: { id: site.id }, data: { status: "DRAFT", previewApprovedAt: null } });
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

const IN_FLIGHT_GENERATION_STATUSES: GenerationStatus[] = ["PENDING", "RUNNING"];

/** Liveness = COALESCE(heartbeatAt, startedAt, updatedAt); the updatedAt branch recovers legacy/never-claimed rows (see the import equivalent). */
function staleGenerationWhere(cutoff: Date): Prisma.GenerationJobWhereInput {
  return {
    status: { in: IN_FLIGHT_GENERATION_STATUSES },
    OR: [
      { heartbeatAt: { lt: cutoff } },
      { heartbeatAt: null, startedAt: { lt: cutoff } },
      { heartbeatAt: null, startedAt: null, updatedAt: { lt: cutoff } },
    ],
  };
}

/** A reaper re-enqueue needs a user to attribute the batch to; fall back to the site owner when the job predates the createdById column. */
async function resolveGenerationCreatedById(job: GenerationJob): Promise<string | null> {
  if (job.createdById) return job.createdById;
  const site = await prisma.site.findUnique({ where: { id: job.siteId }, select: { restaurantId: true } });
  if (!site) return null;
  const restaurant = await prisma.restaurant.findUnique({ where: { id: site.restaurantId }, select: { ownerId: true } });
  return restaurant?.ownerId ?? null;
}

async function failStaleGeneration(jobId: string, message: string): Promise<void> {
  await prisma.generationJob.updateMany({
    where: { id: jobId, status: { in: IN_FLIGHT_GENERATION_STATUSES } },
    data: { status: "FAILED", error: message, heartbeatAt: null },
  });
}

/**
 * §Job Durability — recovers GenerationJobs abandoned by a dead worker
 * (process restart/crash/OOM mid-pipeline) or never claimed. Same contract
 * as reapStaleImportJobs: stale + under MAX_ATTEMPTS → reset to PENDING and
 * re-enqueue; otherwise fail honestly. Only touches PENDING/RUNNING;
 * COMPLETED/FAILED are never reaped. The generator's own transaction
 * archives leftover VARIATIONs, so a retried batch supersedes any partial
 * one cleanly.
 */
export async function reapStaleGenerationJobs(now: Date = new Date()): Promise<ReapResult> {
  const stale = await prisma.generationJob.findMany({ where: staleGenerationWhere(staleCutoff(now)) });

  let requeued = 0;
  let failed = 0;
  for (const job of stale) {
    if (job.attempts >= MAX_ATTEMPTS) {
      await failStaleGeneration(job.id, "Website generation timed out after several attempts. Please try again.");
      failed += 1;
      continue;
    }

    const createdById = await resolveGenerationCreatedById(job);
    if (!createdById) {
      await failStaleGeneration(job.id, "Website generation timed out and couldn't be retried automatically. Please try again.");
      failed += 1;
      continue;
    }

    const reset = await prisma.generationJob.updateMany({
      where: { id: job.id, status: { in: IN_FLIGHT_GENERATION_STATUSES } },
      data: { status: "PENDING", startedAt: null, heartbeatAt: null },
    });
    if (reset.count === 0) continue; // another transition won the race
    generationJobRunner.enqueue(job.id, job.siteId, job.batchId, createdById);
    requeued += 1;
  }

  return { requeued, failed };
}
