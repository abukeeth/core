import { S3Client } from "@aws-sdk/client-s3";
import { getOptionalEnv, getStringEnv, requireEnv } from "../config/env";

/**
 * Production Hardening Phase 7 — shared S3-compatible client, mirroring
 * lib/prisma.ts/lib/redis.ts's singleton pattern. Deliberately provider-
 * agnostic: AWS S3, Cloudflare R2, Backblaze B2, and MinIO all speak this
 * same API, differing only in endpoint/region/path-style addressing.
 *
 * `null` when OBJECT_STORAGE_BUCKET isn't configured — file-storage.ts
 * and release-storage.ts each use this to decide, at their own module
 * load, whether to construct their S3-backed implementation at all. This
 * module never throws just from being imported; only actually
 * constructing an S3 client's dependent (isObjectStorageConfigured()
 * returning true, then calling getObjectStorageBucket()/getS3Client())
 * requires the rest of the OBJECT_STORAGE_* variables to be present.
 */

export function isObjectStorageConfigured(): boolean {
  return Boolean(getOptionalEnv("OBJECT_STORAGE_BUCKET"));
}

export function getObjectStorageBucket(): string {
  return requireEnv("OBJECT_STORAGE_BUCKET");
}

let cachedClient: S3Client | undefined;

/** Lazily constructed, memoized — only ever called once isObjectStorageConfigured() is true. */
export function getS3Client(): S3Client {
  if (cachedClient) return cachedClient;

  const endpoint = getOptionalEnv("OBJECT_STORAGE_ENDPOINT");
  cachedClient = new S3Client({
    region: getStringEnv("OBJECT_STORAGE_REGION", "auto"),
    // Non-AWS S3-compatible providers (R2, B2, MinIO) are reached via an
    // explicit endpoint and need path-style addressing
    // (https://endpoint/bucket/key) rather than AWS's default virtual-
    // hosted-style (https://bucket.s3.region.amazonaws.com/key).
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
    credentials: {
      accessKeyId: requireEnv("OBJECT_STORAGE_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("OBJECT_STORAGE_SECRET_ACCESS_KEY"),
    },
  });
  return cachedClient;
}

/** Test-only: clears the memoized client so a test can construct a fresh one against a changed env. Never call from application code. */
export function __resetS3ClientForTests(): void {
  cachedClient = undefined;
}
