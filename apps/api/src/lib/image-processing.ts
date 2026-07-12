import sharp from "sharp";

/**
 * Production Hardening Phase 8 — generates a small fixed set of
 * responsive variants at upload/import time (§ "Generate a small fixed
 * set of variants (thumbnail/card/full) rather than one full-resolution
 * file reused everywhere"), rather than an on-the-fly/CDN transform
 * pipeline (presented in the master spec as a later option if load
 * testing shows this insufficient).
 *
 * All variants are re-encoded to WebP — smaller than the original
 * PNG/JPEG for the same visual quality, and what the existing
 * Performance score suggestion text already promises ("AVIF/WebP
 * renditions at every breakpoint").
 */

export const IMAGE_RENDITION_NAMES = ["thumbnail", "card", "full"] as const;
export type ImageRenditionName = (typeof IMAGE_RENDITION_NAMES)[number];

const RENDITION_WIDTHS: Record<ImageRenditionName, number> = {
  thumbnail: 200,
  card: 600,
  full: 1600,
};

const WEBP_QUALITY = 80;

export type GeneratedRenditions = Record<ImageRenditionName, Buffer>;

/** Storage keys for the responsive variants — same shape fileStorage.save() returns per key. Stored as SiteAsset.renditions (Json). */
export type AssetRenditions = Record<ImageRenditionName, string>;

/**
 * Picks the storage key of a given responsive variant for a stored asset,
 * falling back to the full-resolution original when `renditions` is null
 * (never processed, or resizing failed open) — the read-side half of
 * Phase 8's "renderer must use the optimized variant, not the original
 * passed straight through" requirement. Takes a structural type rather
 * than importing `SiteAsset` from Prisma, so this stays a dependency-free
 * pure module callers on both the write side (asset.service.ts) and the
 * read side (renderer/render-site.ts) can share without introducing a
 * circular import between those two.
 */
export function resolveAssetRenditionKey(asset: { storageKey: string; renditions: unknown }, variant: ImageRenditionName): string {
  const renditions = asset.renditions as AssetRenditions | null;
  return renditions?.[variant] ?? asset.storageKey;
}

const RASTER_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export function isRasterImageMimeType(mimeType: string): boolean {
  return RASTER_IMAGE_MIME_TYPES.has(mimeType);
}

/**
 * Fail-open by contract (master spec Phase 8 item 4): a resize failure —
 * corrupt/truncated image bytes, an unsupported format, a decompression-
 * bomb guard tripping — must never block the underlying upload/import.
 * Returns null rather than throwing; callers fall back to storing only
 * the original file, exactly as they did before this phase existed.
 */
export async function generateImageRenditions(buffer: Buffer, mimeType: string): Promise<GeneratedRenditions | null> {
  if (!isRasterImageMimeType(mimeType)) {
    return null;
  }

  try {
    const entries = await Promise.all(
      IMAGE_RENDITION_NAMES.map(async (name) => {
        const resized = await sharp(buffer, { failOn: "none" })
          .rotate()
          .resize({ width: RENDITION_WIDTHS[name], withoutEnlargement: true })
          .webp({ quality: WEBP_QUALITY })
          .toBuffer();
        return [name, resized] as const;
      }),
    );
    return Object.fromEntries(entries) as GeneratedRenditions;
  } catch {
    return null;
  }
}
