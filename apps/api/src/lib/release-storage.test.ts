import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { releaseStorage } from "./release-storage";

let testDir: string;

beforeEach(() => {
  testDir = path.join(os.tmpdir(), `release-storage-test-${randomUUID()}`);
  process.env.SITE_RELEASE_DIR = testDir;
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

describe("releaseStorage", () => {
  it("round-trips a saved page by siteId/versionId/slug", async () => {
    await releaseStorage.savePage("site-1", "v1", "/", "<html>home</html>");
    expect(await releaseStorage.readPage("site-1", "v1", "/")).toBe("<html>home</html>");
  });

  it("maps a non-root slug to a filename derived from the slug", async () => {
    await releaseStorage.savePage("site-1", "v1", "/menu", "<html>menu</html>");
    expect(await releaseStorage.readPage("site-1", "v1", "/menu")).toBe("<html>menu</html>");
  });

  it("returns null for a page that was never saved", async () => {
    expect(await releaseStorage.readPage("site-1", "v1", "/gallery")).toBeNull();
  });

  it("keeps different versions of the same site isolated from each other", async () => {
    await releaseStorage.savePage("site-1", "v1", "/", "<html>v1</html>");
    await releaseStorage.savePage("site-1", "v2", "/", "<html>v2</html>");

    expect(await releaseStorage.readPage("site-1", "v1", "/")).toBe("<html>v1</html>");
    expect(await releaseStorage.readPage("site-1", "v2", "/")).toBe("<html>v2</html>");
  });

  it("round-trips a non-page asset (e.g. sitemap.xml)", async () => {
    await releaseStorage.saveAsset("site-1", "v1", "sitemap.xml", "<urlset></urlset>");
    expect(await releaseStorage.readAsset("site-1", "v1", "sitemap.xml")).toBe("<urlset></urlset>");
  });
});
