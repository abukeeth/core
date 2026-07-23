import { ImportSourceType } from "@prisma/client";
import type { AIMediaType } from "../../lib/ai";
import { getNumberEnv } from "../../config/env";
import { importAdapterRegistry } from "./adapters/registry";
import { selectBestImagesForAnalysis, type RankableImage } from "./image-ranking";
import { mergeExtractedMenuData } from "./merge-extracted-data";
import type { ExtractedMenuData } from "./types";
import { extractMenuFromImageParts } from "./vision-extractor";

/**
 * Onboarding V3 — the "Analyze My Business" step. Runs every uploaded source
 * (best-N images + PDFs + website URL + Google Maps URL) through the existing
 * per-source extractors and merges them into ONE ExtractedMenuData the review
 * screen edits before Build. Nothing here is new extraction logic — it
 * orchestrates the adapters/extractors that already exist.
 */

const AI_MEDIA_TYPES = new Set<AIMediaType>(["image/jpeg", "image/png", "image/gif", "image/webp"]);
function toAIMediaType(mime: string): AIMediaType {
  return AI_MEDIA_TYPES.has(mime as AIMediaType) ? (mime as AIMediaType) : "image/jpeg";
}

export interface ConsolidatedSources {
  /** Raster images (jpeg/png/webp/gif). Only the best N are analysed. */
  images: RankableImage[];
  /** PDF menus — each analysed in full (bounded by the upload size limit). */
  pdfs: { buffer: Buffer; mimeType: string }[];
  websiteUrl?: string;
  googleMapsUrl?: string;
}

export interface ConsolidatedResult {
  extracted: ExtractedMenuData;
  analyzedImageCount: number;
  /** Images kept for gallery/brand imagery, not analysed. */
  galleryImageCount: number;
  /** Per-source failures that were tolerated (a partial import still succeeds). */
  sourceErrors: { source: string; message: string }[];
}

export class ConsolidatedExtractionFailedError extends Error {
  constructor(public readonly sourceErrors: { source: string; message: string }[]) {
    super(
      sourceErrors.length > 0
        ? `Couldn't read any of your sources. ${sourceErrors.map((e) => `${e.source}: ${e.message}`).join("; ")}`
        : "No sources were provided to import.",
    );
    this.name = "ConsolidatedExtractionFailedError";
  }
}

function requireAdapter(sourceType: ImportSourceType) {
  const adapter = importAdapterRegistry.get(sourceType);
  if (!adapter || !adapter.implemented) {
    throw new Error(`Import source "${sourceType}" is not available`);
  }
  return adapter;
}

/**
 * Extracts + merges. A single source failing (a broken URL, one bad PDF) is
 * tolerated and reported in `sourceErrors`; only when EVERY source fails does
 * this throw (so the caller can mark the job FAILED with an honest message).
 */
export async function runConsolidatedExtraction(
  sources: ConsolidatedSources,
  opts?: { maxImagesToAnalyze?: number },
): Promise<ConsolidatedResult> {
  const maxImages = opts?.maxImagesToAnalyze ?? getNumberEnv("IMPORT_MAX_IMAGES_ANALYZED", 10);
  const { analyzed, gallery } = await selectBestImagesForAnalysis(sources.images, maxImages);

  const tasks: { source: string; run: () => Promise<ExtractedMenuData> }[] = [];

  if (analyzed.length > 0) {
    tasks.push({
      source: "images",
      run: () => extractMenuFromImageParts(analyzed.map((i) => ({ data: i.buffer, mediaType: toAIMediaType(i.mimeType) }))),
    });
  }
  sources.pdfs.forEach((pdf, index) => {
    tasks.push({
      source: `pdf-${index + 1}`,
      run: () => requireAdapter(ImportSourceType.PDF).extract({ kind: "file", buffer: pdf.buffer, mimeType: pdf.mimeType }),
    });
  });
  if (sources.websiteUrl) {
    const url = sources.websiteUrl;
    tasks.push({ source: "website", run: () => requireAdapter(ImportSourceType.WEBSITE).extract({ kind: "url", url }) });
  }
  if (sources.googleMapsUrl) {
    const url = sources.googleMapsUrl;
    tasks.push({ source: "google_maps", run: () => requireAdapter(ImportSourceType.GOOGLE_MAPS).extract({ kind: "url", url }) });
  }

  const settled = await Promise.allSettled(tasks.map((task) => task.run()));

  const results: ExtractedMenuData[] = [];
  const sourceErrors: { source: string; message: string }[] = [];
  settled.forEach((outcome, index) => {
    if (outcome.status === "fulfilled") {
      results.push(outcome.value);
    } else {
      sourceErrors.push({
        source: tasks[index]!.source,
        message: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
      });
    }
  });

  if (results.length === 0) {
    throw new ConsolidatedExtractionFailedError(sourceErrors);
  }

  return {
    extracted: mergeExtractedMenuData(results),
    analyzedImageCount: analyzed.length,
    galleryImageCount: gallery.length,
    sourceErrors,
  };
}
