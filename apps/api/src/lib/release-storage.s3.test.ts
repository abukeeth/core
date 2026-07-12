import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * S3-backed ReleaseStorage tests (Production Hardening Phase 7) — kept in
 * a separate file from release-storage.test.ts specifically so that
 * file's existing local-disk tests stay completely untouched (master
 * spec Phase 7 verification: "the existing import/sites test suites pass
 * unmodified... if any existing test needs to change... that's a signal
 * the abstraction boundary was violated").
 */

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
  vi.doUnmock("@aws-sdk/client-s3");
});

describe("releaseStorage — S3-backed (OBJECT_STORAGE_BUCKET set)", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    process.env.OBJECT_STORAGE_BUCKET = "test-bucket";
    process.env.OBJECT_STORAGE_REGION = "us-east-1";
    process.env.OBJECT_STORAGE_ACCESS_KEY_ID = "test-access-key";
    process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY = "test-secret-key";

    vi.doMock("@aws-sdk/client-s3", () => {
      class FakePutObjectCommand {
        constructor(public input: { Bucket: string; Key: string; Body: string }) {}
      }
      class FakeGetObjectCommand {
        constructor(public input: { Bucket: string; Key: string }) {}
      }
      class FakeS3Client {
        async send(command: FakePutObjectCommand | FakeGetObjectCommand) {
          if (command instanceof FakePutObjectCommand) {
            store.set(command.input.Key, command.input.Body);
            return {};
          }
          const text = store.get(command.input.Key);
          if (text === undefined) {
            const err = new Error("NoSuchKey");
            err.name = "NoSuchKey";
            throw err;
          }
          return { Body: { transformToString: async () => text } };
        }
      }
      return { S3Client: FakeS3Client, PutObjectCommand: FakePutObjectCommand, GetObjectCommand: FakeGetObjectCommand };
    });
  });

  it("round-trips a saved page by siteId/versionId/slug", async () => {
    vi.resetModules();
    const { releaseStorage } = await import("./release-storage.js");
    await releaseStorage.savePage("site-1", "v1", "/", "<html>home</html>");
    expect(await releaseStorage.readPage("site-1", "v1", "/")).toBe("<html>home</html>");
  });

  it("maps a non-root slug to a filename derived from the slug", async () => {
    vi.resetModules();
    const { releaseStorage } = await import("./release-storage.js");
    await releaseStorage.savePage("site-1", "v1", "/menu", "<html>menu</html>");
    expect(await releaseStorage.readPage("site-1", "v1", "/menu")).toBe("<html>menu</html>");
  });

  it("returns null for a page that was never saved (mirrors the local-disk ENOENT-is-null contract)", async () => {
    vi.resetModules();
    const { releaseStorage } = await import("./release-storage.js");
    expect(await releaseStorage.readPage("site-1", "v1", "/gallery")).toBeNull();
  });

  it("keeps different versions of the same site isolated from each other", async () => {
    vi.resetModules();
    const { releaseStorage } = await import("./release-storage.js");
    await releaseStorage.savePage("site-1", "v1", "/", "<html>v1</html>");
    await releaseStorage.savePage("site-1", "v2", "/", "<html>v2</html>");

    expect(await releaseStorage.readPage("site-1", "v1", "/")).toBe("<html>v1</html>");
    expect(await releaseStorage.readPage("site-1", "v2", "/")).toBe("<html>v2</html>");
  });

  it("round-trips a non-page asset (e.g. sitemap.xml)", async () => {
    vi.resetModules();
    const { releaseStorage } = await import("./release-storage.js");
    await releaseStorage.saveAsset("site-1", "v1", "sitemap.xml", "<urlset></urlset>");
    expect(await releaseStorage.readAsset("site-1", "v1", "sitemap.xml")).toBe("<urlset></urlset>");
  });

  it("uses a site-releases/ prefixed key so it can share a bucket with fileStorage's uploads/ prefix", async () => {
    vi.resetModules();
    const { releaseStorage } = await import("./release-storage.js");
    await releaseStorage.savePage("site-1", "v1", "/", "<html>home</html>");
    expect(Array.from(store.keys())).toEqual(["site-releases/site-1/v1/index.html"]);
  });
});
