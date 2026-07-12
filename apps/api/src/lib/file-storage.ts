import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getStringEnv } from "../config/env";
import { getObjectStorageBucket, getS3Client, isObjectStorageConfigured } from "./object-storage-client";

export interface FileStorage {
  save(buffer: Buffer, originalName: string): Promise<{ path: string }>;
  read(storedPath: string): Promise<Buffer>;
}

/**
 * MVP implementation writes to local disk. Swappable for S3/GCS later
 * without changing any caller — they only depend on the FileStorage interface.
 */
class LocalDiskFileStorage implements FileStorage {
  private readonly baseDir = path.resolve(getStringEnv("IMPORT_UPLOAD_DIR", "uploads"));

  async save(buffer: Buffer, originalName: string): Promise<{ path: string }> {
    await mkdir(this.baseDir, { recursive: true });
    const safeExtension = path.extname(originalName).replace(/[^a-zA-Z0-9.]/g, "");
    const storedPath = path.join(this.baseDir, `${randomUUID()}${safeExtension}`);
    await writeFile(storedPath, buffer);
    return { path: storedPath };
  }

  async read(storedPath: string): Promise<Buffer> {
    return readFile(storedPath);
  }
}

/**
 * Production Hardening Phase 7 — durable object storage for import
 * uploads (menu PDFs/photos) and site assets (hero/gallery/logo/OG
 * images), replacing local disk (ephemeral in a container — see Phase 4's
 * sequencing callout). Keys are prefixed `uploads/`, mirroring
 * IMPORT_UPLOAD_DIR's local-disk naming intent, so this can share a
 * bucket with S3ReleaseStorage's `site-releases/` prefix without
 * colliding.
 *
 * `path` in the returned `{ path }` is the S3 object key here, not a
 * filesystem path — every caller (asset.service.ts, import.service.ts)
 * already treats it as an opaque identifier to store and pass back to
 * `read()`, never as something to parse or display directly, so this is
 * not a caller-visible change (the one place that *does* interpret it,
 * renderer/asset-url.ts, is updated in this same phase to be storage-
 * backend-aware).
 */
class S3FileStorage implements FileStorage {
  async save(buffer: Buffer, originalName: string): Promise<{ path: string }> {
    const safeExtension = path.extname(originalName).replace(/[^a-zA-Z0-9.]/g, "");
    const key = `uploads/${randomUUID()}${safeExtension}`;
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: getObjectStorageBucket(),
        Key: key,
        Body: buffer,
      }),
    );
    return { path: key };
  }

  async read(storedPath: string): Promise<Buffer> {
    const result = await getS3Client().send(
      new GetObjectCommand({ Bucket: getObjectStorageBucket(), Key: storedPath }),
    );
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) {
      throw new Error(`Object storage returned an empty body for key: ${storedPath}`);
    }
    return Buffer.from(bytes);
  }
}

/**
 * Env-driven factory (Production Hardening Phase 7): OBJECT_STORAGE_BUCKET
 * unset means local disk, identical to every environment before this
 * phase — set it (plus the other OBJECT_STORAGE_* variables) to switch to
 * durable object storage with no caller-visible change either way. See
 * docs/runbooks/object-storage.md.
 */
function createFileStorage(): FileStorage {
  return isObjectStorageConfigured() ? new S3FileStorage() : new LocalDiskFileStorage();
}

export const fileStorage: FileStorage = createFileStorage();
