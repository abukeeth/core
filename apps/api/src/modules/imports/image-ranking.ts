import sharp from "sharp";

/**
 * Onboarding V3 — an owner can upload up to 30 files, but analysing every image
 * with vision AI is slow and costly. We analyse only the best N (default 10)
 * and keep the rest for the storefront gallery / brand imagery. "Best" is a
 * clarity/detail proxy: pixel resolution (width × height), since a higher-res
 * photo generally carries more legible menu detail than a small/thumbnail one.
 * This is a heuristic (not true menu-relevance, which would need analysing them
 * all — the very cost we're avoiding); the owner can promote more images to
 * analysis from the review screen.
 */
export interface RankableImage {
  buffer: Buffer;
  mimeType: string;
  originalName?: string;
}

export interface ImageSelection<T> {
  /** Highest-clarity images, to send to vision AI (capped at maxCount). */
  analyzed: T[];
  /** The remainder, kept for gallery / brand imagery — never analysed. */
  gallery: T[];
}

/** Pixel area as a clarity proxy. Fail-open: an unreadable image ranks last (0). */
async function pixelArea(buffer: Buffer): Promise<number> {
  try {
    const { width, height } = await sharp(buffer, { failOn: "none" }).metadata();
    if (width && height) return width * height;
  } catch {
    // Corrupt/unsupported metadata — fall through to 0 so it ranks lowest.
  }
  return 0;
}

export async function selectBestImagesForAnalysis<T extends RankableImage>(
  images: T[],
  maxCount: number,
): Promise<ImageSelection<T>> {
  if (maxCount <= 0) return { analyzed: [], gallery: [...images] };
  if (images.length <= maxCount) return { analyzed: [...images], gallery: [] };

  const scored = await Promise.all(
    images.map(async (img, index) => ({ img, index, area: await pixelArea(img.buffer), bytes: img.buffer.length })),
  );
  // Highest resolution first; tie-break by byte size, then original order for
  // determinism (so the same upload always selects the same images).
  scored.sort((a, b) => b.area - a.area || b.bytes - a.bytes || a.index - b.index);

  return {
    analyzed: scored.slice(0, maxCount).map((s) => s.img),
    gallery: scored.slice(maxCount).map((s) => s.img),
  };
}
