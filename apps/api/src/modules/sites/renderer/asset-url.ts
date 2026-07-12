import path from "node:path";
import { getOptionalEnv } from "../../../config/env";
import { isObjectStorageConfigured } from "../../../lib/object-storage-client";

/**
 * Maps a SiteAsset's storageKey (from fileStorage.save) to a publicly
 * servable URL — the one seam anticipated for exactly this purpose since
 * Sprint 06 ("the one seam to swap if storage moves to a real CDN...
 * later"). Must stay in sync with app.ts's `registerAssetsRoute`, which
 * this mirrors:
 *
 * 1. Local disk (OBJECT_STORAGE_BUCKET unset): unchanged — `storageKey`
 *    is a filesystem path, so only the basename (fileStorage's random
 *    UUID filename) is meaningful as a URL segment.
 * 2. Direct-from-CDN (OBJECT_STORAGE_PUBLIC_URL_BASE set, Production
 *    Hardening Phase 7's recommended path): the full storageKey (already
 *    an S3 object key, e.g. "uploads/<uuid>.png") appended to the
 *    configured public base — served straight from the bucket/CDN
 *    domain, never touching this API.
 * 3. Proxied through the API (object storage configured, no public URL
 *    base yet): the full storageKey under `/assets/`, matching
 *    app.ts's proxy route, which reads it back via the same key.
 */
export function assetUrl(storageKey: string): string {
  const publicBase = getOptionalEnv("OBJECT_STORAGE_PUBLIC_URL_BASE");
  if (publicBase) {
    return `${publicBase.replace(/\/+$/, "")}/${storageKey}`;
  }
  if (isObjectStorageConfigured()) {
    return `/assets/${storageKey}`;
  }
  return `/assets/${path.basename(storageKey)}`;
}
