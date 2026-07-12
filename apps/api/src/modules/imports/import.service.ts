import type { ImportJob } from "@prisma/client";
import { ImportStatus, Prisma } from "@prisma/client";
import { fileStorage } from "../../lib/file-storage";
import { createLogger } from "../../lib/logger";
import { prisma } from "../../lib/prisma";
import { createCategory, createItem } from "../menu/menu.service";
import { updateRestaurantById } from "../restaurants/restaurant.service";
import { ImportJobNotFoundError, ImportJobNotReadyError, ImportJobNotRerunnableError } from "./import.errors";
import type { CreateImportInput } from "./import.validation";
import { importJobRunner } from "./job-runner";
import { extractedMenuDataSchema, type ExtractedMenuData, type ImportSourceInput } from "./types";

const logger = createLogger("import-service");

export interface UploadedFile {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
}

export async function createImportJob(
  restaurantId: string,
  createdById: string,
  input: CreateImportInput,
  file?: UploadedFile,
): Promise<ImportJob> {
  let sourceFilePath: string | undefined;
  let sourceInput: ImportSourceInput;

  let sourceMimeType: string | undefined;

  if (file) {
    // Best-effort: extraction below runs off the in-memory buffer, never
    // off this saved copy, so a persistence failure (e.g. no object
    // storage configured and the local-disk fallback's directory isn't
    // writable in this deployment target) shouldn't fail the import
    // itself — it only means rerunJob won't have a file to re-read later.
    try {
      const saved = await fileStorage.save(file.buffer, file.originalName);
      sourceFilePath = saved.path;
      sourceMimeType = file.mimeType;
    } catch (err) {
      logger.warn({ err }, "createImportJob: failed to persist a copy of the uploaded file; continuing without it");
    }
    sourceInput = { kind: "file", buffer: file.buffer, mimeType: file.mimeType };
  } else {
    if (!input.sourceUrl) {
      throw new Error("createImportJob requires either a file or a sourceUrl");
    }
    sourceInput = { kind: "url", url: input.sourceUrl };
  }

  const job = await prisma.importJob.create({
    data: {
      restaurantId,
      createdById,
      sourceType: input.sourceType,
      sourceFilePath,
      sourceMimeType,
      sourceUrl: input.sourceUrl,
    },
  });

  importJobRunner.enqueue(job.id, sourceInput);

  return job;
}

async function findOwnJob(restaurantId: string, jobId: string): Promise<ImportJob> {
  const job = await prisma.importJob.findUnique({ where: { id: jobId } });
  if (!job || job.restaurantId !== restaurantId) {
    throw new ImportJobNotFoundError();
  }
  return job;
}

export async function getJob(restaurantId: string, jobId: string): Promise<ImportJob> {
  return findOwnJob(restaurantId, jobId);
}

export async function listJobs(restaurantId: string): Promise<ImportJob[]> {
  return prisma.importJob.findMany({ where: { restaurantId }, orderBy: { createdAt: "desc" } });
}

export async function approveJob(restaurantId: string, jobId: string): Promise<ImportJob> {
  const job = await findOwnJob(restaurantId, jobId);
  if (job.status !== ImportStatus.AWAITING_REVIEW || !job.extractedData) {
    throw new ImportJobNotReadyError();
  }

  const extracted = extractedMenuDataSchema.parse(job.extractedData);

  for (const category of extracted.categories) {
    const createdCategory = await createCategory(restaurantId, { name: category.name });
    for (const item of category.items) {
      await createItem(restaurantId, {
        categoryId: createdCategory.id,
        name: item.name,
        description: item.description,
        priceCents: item.priceCents,
      });
    }
  }

  if (extracted.businessProfile) {
    await updateRestaurantById(restaurantId, extracted.businessProfile);
  }

  return prisma.importJob.update({
    where: { id: job.id },
    data: { status: ImportStatus.APPROVED, reviewedAt: new Date() },
  });
}

/**
 * Lets the reviewer edit the AI-extracted data (bulk category
 * reassignment, deleting bad rows, fixing a name/price) before it's
 * committed to the menu — persisted here so approveJob's own re-read of
 * job.extractedData picks up the edits, rather than the review screen
 * needing a separate "apply my edits" code path.
 */
export async function updateJobData(restaurantId: string, jobId: string, data: ExtractedMenuData): Promise<ImportJob> {
  const job = await findOwnJob(restaurantId, jobId);
  if (job.status !== ImportStatus.AWAITING_REVIEW) {
    throw new ImportJobNotReadyError();
  }

  return prisma.importJob.update({
    where: { id: job.id },
    data: { extractedData: data },
  });
}

/**
 * Re-runs extraction for an existing job using its own already-stored
 * file (re-read from fileStorage) or sourceUrl — the same inputs the
 * original createImportJob call used, so a FAILED job (transient fetch
 * error, flaky AI call) or simply a website that's changed since the
 * last import can be retried without the owner re-uploading/re-pasting
 * anything. Resets status/extractedData so job-runner processes it fresh;
 * does not touch anything already approved into the live menu from a
 * prior run of this same job.
 */
export async function rerunJob(restaurantId: string, jobId: string): Promise<ImportJob> {
  const job = await findOwnJob(restaurantId, jobId);

  let sourceInput: ImportSourceInput;
  if (job.sourceFilePath) {
    const buffer = await fileStorage.read(job.sourceFilePath);
    sourceInput = { kind: "file", buffer, mimeType: job.sourceMimeType ?? "application/octet-stream" };
  } else if (job.sourceUrl) {
    sourceInput = { kind: "url", url: job.sourceUrl };
  } else {
    throw new ImportJobNotRerunnableError();
  }

  const updated = await prisma.importJob.update({
    where: { id: job.id },
    data: { status: ImportStatus.PENDING, errorMessage: null, extractedData: Prisma.JsonNull, reviewedAt: null },
  });

  importJobRunner.enqueue(updated.id, sourceInput);

  return updated;
}

export async function rejectJob(restaurantId: string, jobId: string): Promise<ImportJob> {
  const job = await findOwnJob(restaurantId, jobId);
  return prisma.importJob.update({
    where: { id: job.id },
    data: { status: ImportStatus.REJECTED, reviewedAt: new Date() },
  });
}
