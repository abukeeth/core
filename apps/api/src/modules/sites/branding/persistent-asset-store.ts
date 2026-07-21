import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getStringEnv } from "../../../config/env";
import type { GeneratedImage } from "../../../lib/ai/image";
import { getObjectStorageBucket, getS3Client, isObjectStorageConfigured } from "../../../lib/object-storage-client";
import { assetUrl } from "../renderer/asset-url";
import type { BrandAssetStore, StoredBrandAsset } from "./asset-store";

/**
 * Sprint 5.5 — persistent, object-storage-backed brand asset store.
 *
 * Generated impression images are written once to durable storage (S3-compatible
 * object storage, or local disk in dev) at a DETERMINISTIC key derived from the
 * cache key — so the same asset is found again after a process restart, and the
 * same request across variations/renders resolves to the same object (the
 * two-tier cache without a separate index). Provenance (`source: "ai_generated"`)
 * and the cache key travel on every stored asset.
 *
 * The low-level blob operations sit behind `BlobBackend` so the store is fully
 * unit-testable (and so disk vs. S3 is an implementation detail).
 */

export interface BlobBackend {
  exists(key: string): Promise<boolean>;
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  url(key: string): string;
}

const CONTENT_TYPE: Record<string, string> = {
  "image/svg+xml": "image/svg+xml",
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};

function storageKeyFor(cacheKey: string): string {
  return `brand-assets/${cacheKey}`;
}

function toStoredAsset(cacheKey: string, storageKey: string, url: string, altText?: string): StoredBrandAsset {
  return { url, storageKey, source: "ai_generated", cacheKey, altText };
}

class DiskBlobBackend implements BlobBackend {
  private readonly baseDir = path.resolve(getStringEnv("IMPORT_UPLOAD_DIR", "uploads"));

  async exists(key: string): Promise<boolean> {
    try {
      await access(path.join(this.baseDir, key));
      return true;
    } catch {
      return false;
    }
  }

  async put(key: string, data: Buffer): Promise<void> {
    const filePath = path.join(this.baseDir, key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
  }

  url(key: string): string {
    return assetUrl(key);
  }
}

class S3BlobBackend implements BlobBackend {
  async exists(key: string): Promise<boolean> {
    try {
      await getS3Client().send(new HeadObjectCommand({ Bucket: getObjectStorageBucket(), Key: key }));
      return true;
    } catch {
      return false;
    }
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    await getS3Client().send(new PutObjectCommand({ Bucket: getObjectStorageBucket(), Key: key, Body: data, ContentType: contentType }));
  }

  url(key: string): string {
    return assetUrl(key);
  }
}

export class ObjectStorageBrandAssetStore implements BrandAssetStore {
  constructor(private readonly blob: BlobBackend) {}

  async get(cacheKey: string): Promise<StoredBrandAsset | null> {
    const key = storageKeyFor(cacheKey);
    return (await this.blob.exists(key)) ? toStoredAsset(cacheKey, key, this.blob.url(key)) : null;
  }

  async put(cacheKey: string, image: GeneratedImage, meta: { businessId: string; surface: string; altText?: string }): Promise<StoredBrandAsset> {
    const key = storageKeyFor(cacheKey);
    await this.blob.put(key, image.data, CONTENT_TYPE[image.mediaType] ?? "application/octet-stream");
    return toStoredAsset(cacheKey, key, this.blob.url(key), meta.altText);
  }
}

/** Production factory — S3 when object storage is configured, local disk otherwise. Both survive restarts. */
export function createBrandAssetStore(): BrandAssetStore {
  return new ObjectStorageBrandAssetStore(isObjectStorageConfigured() ? new S3BlobBackend() : new DiskBlobBackend());
}
