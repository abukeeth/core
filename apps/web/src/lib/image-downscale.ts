"use client";

/**
 * Setup Wizard Stabilization — client-side image downscaling before upload.
 *
 * Phone menu photos are routinely 4-12MB; uploading and OCR'ing them raw is
 * the single slowest part of onboarding. Downscaling to a sensible long-edge
 * and JPEG quality on-device cuts upload bytes (and server-side OCR time) by
 * an order of magnitude, with no visible loss for reading menu text.
 *
 * Deliberately conservative and FAIL-OPEN: only touches raster photos above a
 * size threshold, and returns the ORIGINAL file unchanged on anything
 * unexpected — a non-image, a small file, an environment without canvas
 * (SSR/jsdom), a decode/encode failure, or a result that isn't actually
 * smaller. It never throws: a downscale problem must never block an upload the
 * user could otherwise have made.
 */

/** Below this, the round-trip through canvas isn't worth it. */
export const DOWNSCALE_MIN_BYTES = 1_200_000;
/** Long-edge cap in px — ample for menu legibility, far below a modern phone's native resolution. */
export const MAX_DIMENSION = 2000;
const JPEG_QUALITY = 0.82;

export async function downscaleImageFile(file: File): Promise<File> {
  try {
    if (!file.type.startsWith("image/")) return file;
    // Animated GIFs / vector SVGs don't downscale meaningfully via a raster canvas.
    if (file.type === "image/gif" || file.type === "image/svg+xml") return file;
    if (file.size < DOWNSCALE_MIN_BYTES) return file;
    if (typeof document === "undefined" || typeof createImageBitmap !== "function") return file;

    const bitmap = await createImageBitmap(file);
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const scale = longEdge > MAX_DIMENSION ? MAX_DIMENSION / longEdge : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) => {
      if (typeof canvas.toBlob !== "function") {
        resolve(null);
        return;
      }
      canvas.toBlob((b) => resolve(b), "image/jpeg", JPEG_QUALITY);
    });

    // No gain (or encoding unavailable) — keep the original untouched.
    if (!blob || blob.size >= file.size) return file;

    const newName = `${file.name.replace(/\.[^.]+$/, "")}.jpg`;
    return new File([blob], newName, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}
