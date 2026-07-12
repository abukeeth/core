import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getStringEnv } from "../config/env";
import { getObjectStorageBucket, getS3Client, isObjectStorageConfigured } from "./object-storage-client";

export interface ReleaseStorage {
  savePage(siteId: string, versionId: string, slug: string, html: string): Promise<void>;
  readPage(siteId: string, versionId: string, slug: string): Promise<string | null>;
  saveAsset(siteId: string, versionId: string, filename: string, content: string): Promise<void>;
  readAsset(siteId: string, versionId: string, filename: string): Promise<string | null>;
}

function slugToFilename(slug: string): string {
  return slug === "/" ? "index.html" : `${slug.replace(/^\//, "").replace(/\//g, "-")}.html`;
}

/**
 * §19.3/§21 — the "static generation → object storage" step, substituted
 * with local disk (same swappable-interface pattern as fileStorage.ts and
 * safeFetch's design elsewhere in this codebase): publishSite renders
 * every page once and writes it here; production serving reads these
 * files back rather than re-rendering on every request. Deterministic
 * paths (siteId/versionId/page) rather than fileStorage's random UUID
 * naming, since these need to be looked up by known key, not by a
 * returned path.
 */
class LocalDiskReleaseStorage implements ReleaseStorage {
  // Read lazily (not cached at construction) so it reflects the current
  // env at call time — this module is a singleton created once at import.
  private get baseDir(): string {
    return path.resolve(getStringEnv("SITE_RELEASE_DIR", "uploads/site-releases"));
  }

  private versionDir(siteId: string, versionId: string): string {
    return path.join(this.baseDir, siteId, versionId);
  }

  async savePage(siteId: string, versionId: string, slug: string, html: string): Promise<void> {
    const dir = this.versionDir(siteId, versionId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, slugToFilename(slug)), html, "utf-8");
  }

  async readPage(siteId: string, versionId: string, slug: string): Promise<string | null> {
    try {
      return await readFile(path.join(this.versionDir(siteId, versionId), slugToFilename(slug)), "utf-8");
    } catch {
      return null;
    }
  }

  async saveAsset(siteId: string, versionId: string, filename: string, content: string): Promise<void> {
    const dir = this.versionDir(siteId, versionId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), content, "utf-8");
  }

  async readAsset(siteId: string, versionId: string, filename: string): Promise<string | null> {
    try {
      return await readFile(path.join(this.versionDir(siteId, versionId), filename), "utf-8");
    } catch {
      return null;
    }
  }
}

/**
 * Production Hardening Phase 7 — durable object storage for published-
 * site releases, replacing local disk. Unlike SiteAsset's `storageKey`
 * (lib/file-storage.ts), nothing outside this module ever needs a public
 * URL for a release object: every read already goes through the API's
 * own render routes (public-render.routes.ts reads the page/asset
 * *content* here and writes it directly into the HTTP response), so
 * there's no direct-CDN-vs-proxy decision to make for this half of Phase
 * 7 — it's already always "proxied through the API," before and after
 * this phase. Keys are prefixed `site-releases/`, mirroring
 * SITE_RELEASE_DIR's local-disk naming intent.
 */
class S3ReleaseStorage implements ReleaseStorage {
  private key(siteId: string, versionId: string, filename: string): string {
    return `site-releases/${siteId}/${versionId}/${filename}`;
  }

  async savePage(siteId: string, versionId: string, slug: string, html: string): Promise<void> {
    await this.putText(this.key(siteId, versionId, slugToFilename(slug)), html);
  }

  async readPage(siteId: string, versionId: string, slug: string): Promise<string | null> {
    return this.getText(this.key(siteId, versionId, slugToFilename(slug)));
  }

  async saveAsset(siteId: string, versionId: string, filename: string, content: string): Promise<void> {
    await this.putText(this.key(siteId, versionId, filename), content);
  }

  async readAsset(siteId: string, versionId: string, filename: string): Promise<string | null> {
    return this.getText(this.key(siteId, versionId, filename));
  }

  private async putText(key: string, content: string): Promise<void> {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: getObjectStorageBucket(),
        Key: key,
        Body: content,
        ContentType: key.endsWith(".html") ? "text/html; charset=utf-8" : "text/plain; charset=utf-8",
      }),
    );
  }

  private async getText(key: string): Promise<string | null> {
    try {
      const result = await getS3Client().send(new GetObjectCommand({ Bucket: getObjectStorageBucket(), Key: key }));
      const text = await result.Body?.transformToString("utf-8");
      return text ?? null;
    } catch (err) {
      // Mirrors LocalDiskReleaseStorage's readFile-throws-ENOENT-return-null
      // contract: a missing release object (not yet published, or an
      // unknown slug) is a normal "null", not an error — anything else
      // (a real connectivity/permission failure) still propagates.
      if (isNotFoundError(err)) {
        return null;
      }
      throw err;
    }
  }
}

function isNotFoundError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    ("name" in err ? (err as { name?: string }).name === "NoSuchKey" || (err as { name?: string }).name === "NotFound" : false)
  );
}

/**
 * Env-driven factory (Production Hardening Phase 7): OBJECT_STORAGE_BUCKET
 * unset means local disk, identical to every environment before this
 * phase. See docs/runbooks/object-storage.md.
 */
function createReleaseStorage(): ReleaseStorage {
  return isObjectStorageConfigured() ? new S3ReleaseStorage() : new LocalDiskReleaseStorage();
}

export const releaseStorage: ReleaseStorage = createReleaseStorage();
