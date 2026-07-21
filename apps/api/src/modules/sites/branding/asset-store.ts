import type { GeneratedImage } from "../../../lib/ai/image";

/**
 * Sprint 5.5 — brand asset storage port.
 *
 * Generated atmospheric images are stored once and addressed by a deterministic
 * cache key (vertical × surface × palette × prompt-version). Because the key is
 * deterministic, the same request across businesses/variations/renders resolves
 * to the same stored object — that IS the two-tier cache (cross-business +
 * per-business persistence) without a separate index. Every stored asset records
 * its provenance (`source: "ai_generated"`).
 *
 * This module defines the port and an in-memory implementation (used by tests
 * and safe as a default). The production, object-storage-backed implementation
 * is wired at enablement time behind this same interface.
 */

export interface StoredBrandAsset {
  /** Public URL the renderer uses (populates ctx.assets.aiHeroUrl / aiCategoryImages). */
  url: string;
  /** Underlying storage key (object storage / disk). */
  storageKey: string;
  source: "ai_generated";
  cacheKey: string;
  altText?: string;
}

export interface BrandAssetStore {
  /** Cache lookup by deterministic key — a hit means "already generated, reuse". */
  get(cacheKey: string): Promise<StoredBrandAsset | null>;
  /** Persist bytes for a cache key and return the addressable asset. */
  put(cacheKey: string, image: GeneratedImage, meta: { businessId: string; surface: string; altText?: string }): Promise<StoredBrandAsset>;
}

/**
 * In-memory store — deterministic and dependency-free. Used by tests and as a
 * safe default; production swaps in an object-storage-backed store with the same
 * contract (a shared Map here stands in for shared object storage).
 */
export class InMemoryBrandAssetStore implements BrandAssetStore {
  private readonly assets = new Map<string, StoredBrandAsset>();

  async get(cacheKey: string): Promise<StoredBrandAsset | null> {
    return this.assets.get(cacheKey) ?? null;
  }

  async put(cacheKey: string, _image: GeneratedImage, meta: { businessId: string; surface: string; altText?: string }): Promise<StoredBrandAsset> {
    const storageKey = `brand-assets/${cacheKey}.png`;
    const asset: StoredBrandAsset = {
      url: `/assets/${storageKey}`,
      storageKey,
      source: "ai_generated",
      cacheKey,
      altText: meta.altText,
    };
    this.assets.set(cacheKey, asset);
    return asset;
  }

  /** Test/inspection helper: how many distinct assets are stored. */
  size(): number {
    return this.assets.size;
  }
}
