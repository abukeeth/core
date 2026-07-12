/**
 * One-time migration: copies any existing local-disk import
 * uploads/site-releases into the configured object-storage bucket, and
 * rewrites the DB rows that reference them by path (SiteAsset.storageKey,
 * ImportJob.sourceFilePath) — the reasonable-defaults implementation of
 * Production Hardening Phase 7's spec item 5: "expected to be a no-op
 * today (no production deployment has ever existed to have accumulated
 * files), but written for reuse the next time storage providers change."
 *
 * Idempotent and safe to re-run: a SiteAsset/ImportJob row whose path
 * already looks like an S3 key (starts with "uploads/") is skipped, and
 * re-uploading the same bytes under the same key is a harmless no-op.
 *
 * Requires OBJECT_STORAGE_BUCKET (and the rest of the OBJECT_STORAGE_*
 * variables) to already be configured — this migrates *into* object
 * storage; there is deliberately no reverse direction, since the local-
 * disk implementation needs no migration to fall back to (that's the
 * whole point of the factory pattern in lib/file-storage.ts).
 *
 * Usage: pnpm --filter api exec tsx scripts/migrate-storage-to-s3.ts
 */
import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getStringEnv } from "../src/config/env";
import { getObjectStorageBucket, getS3Client, isObjectStorageConfigured } from "../src/lib/object-storage-client";
import { prisma } from "../src/lib/prisma";

async function listFilesRecursive(dir: string): Promise<string[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      return entry.isDirectory() ? listFilesRecursive(fullPath) : [fullPath];
    }),
  );
  return files.flat();
}

async function putFile(client: ReturnType<typeof getS3Client>, bucket: string, key: string, localPath: string): Promise<void> {
  const body = await readFile(localPath);
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body }));
}

function isAlreadyMigratedKey(storedValue: string): boolean {
  return storedValue.startsWith("uploads/") || storedValue.startsWith("site-releases/");
}

/** Migrates fileStorage.save()'s output — SiteAsset.storageKey and ImportJob.sourceFilePath. */
async function migrateFileStorage(): Promise<{ migrated: number; skipped: number }> {
  const client = getS3Client();
  const bucket = getObjectStorageBucket();
  let migrated = 0;
  let skipped = 0;

  const assets = await prisma.siteAsset.findMany({ select: { id: true, storageKey: true } });
  for (const asset of assets) {
    if (isAlreadyMigratedKey(asset.storageKey)) {
      skipped++;
      continue;
    }
    const key = `uploads/${path.basename(asset.storageKey)}`;
    await putFile(client, bucket, key, asset.storageKey);
    await prisma.siteAsset.update({ where: { id: asset.id }, data: { storageKey: key } });
    migrated++;
  }

  const importJobs = await prisma.importJob.findMany({
    where: { sourceFilePath: { not: null } },
    select: { id: true, sourceFilePath: true },
  });
  for (const job of importJobs) {
    const sourceFilePath = job.sourceFilePath;
    if (!sourceFilePath || isAlreadyMigratedKey(sourceFilePath)) {
      skipped++;
      continue;
    }
    const key = `uploads/${path.basename(sourceFilePath)}`;
    await putFile(client, bucket, key, sourceFilePath);
    await prisma.importJob.update({ where: { id: job.id }, data: { sourceFilePath: key } });
    migrated++;
  }

  return { migrated, skipped };
}

/**
 * Migrates release-storage's local-disk tree. No DB rewrite needed —
 * unlike SiteAsset/ImportJob, nothing stores a "path" for a release
 * object; every read is reconstructed from Site.id/SiteVersion.id, which
 * don't change across a storage-backend migration.
 */
async function migrateReleaseStorage(): Promise<{ migrated: number }> {
  const client = getS3Client();
  const bucket = getObjectStorageBucket();
  const baseDir = path.resolve(getStringEnv("SITE_RELEASE_DIR", "uploads/site-releases"));

  const files = await listFilesRecursive(baseDir);
  let migrated = 0;
  for (const localPath of files) {
    const relativePath = path.relative(baseDir, localPath).split(path.sep).join("/");
    const key = `site-releases/${relativePath}`;
    await putFile(client, bucket, key, localPath);
    migrated++;
  }
  return { migrated };
}

async function main() {
  if (!isObjectStorageConfigured()) {
    console.error("OBJECT_STORAGE_BUCKET is not set — nothing to migrate into. Configure object storage first (see docs/runbooks/object-storage.md).");
    process.exitCode = 1;
    return;
  }

  console.log("Migrating fileStorage-referenced rows (SiteAsset, ImportJob)...");
  const fileStorageResult = await migrateFileStorage();
  console.log(`  migrated: ${fileStorageResult.migrated}, already-migrated/skipped: ${fileStorageResult.skipped}`);

  console.log("Migrating release-storage local-disk tree...");
  const releaseStorageResult = await migrateReleaseStorage();
  console.log(`  migrated: ${releaseStorageResult.migrated} file(s)`);

  console.log("Storage migration complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
