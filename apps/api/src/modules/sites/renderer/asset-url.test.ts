import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
});

describe("assetUrl — local disk (Production Hardening Phase 7: OBJECT_STORAGE_BUCKET unset)", () => {
  async function freshAssetUrl() {
    delete process.env.OBJECT_STORAGE_BUCKET;
    delete process.env.OBJECT_STORAGE_PUBLIC_URL_BASE;
    vi.resetModules();
    return (await import("./asset-url.js")).assetUrl;
  }

  it("maps a storage path to /assets/<basename>", async () => {
    const assetUrl = await freshAssetUrl();
    expect(assetUrl("/uploads/abc123.png")).toBe("/assets/abc123.png");
  });

  it("strips any directory prefix, however nested", async () => {
    const assetUrl = await freshAssetUrl();
    expect(assetUrl("/var/data/uploads/sites/xyz/hero.jpg")).toBe("/assets/hero.jpg");
  });

  it("handles a bare filename with no directory", async () => {
    const assetUrl = await freshAssetUrl();
    expect(assetUrl("hero.png")).toBe("/assets/hero.png");
  });
});

describe("assetUrl — direct-from-CDN (Production Hardening Phase 7: OBJECT_STORAGE_PUBLIC_URL_BASE set)", () => {
  async function freshAssetUrl() {
    process.env.OBJECT_STORAGE_BUCKET = "test-bucket";
    process.env.OBJECT_STORAGE_PUBLIC_URL_BASE = "https://cdn.example.com";
    vi.resetModules();
    return (await import("./asset-url.js")).assetUrl;
  }

  it("builds a full URL from the public base plus the whole storage key, unchanged", async () => {
    const assetUrl = await freshAssetUrl();
    expect(assetUrl("uploads/abc123.png")).toBe("https://cdn.example.com/uploads/abc123.png");
  });

  it("strips a trailing slash from the configured base", async () => {
    process.env.OBJECT_STORAGE_PUBLIC_URL_BASE = "https://cdn.example.com/";
    vi.resetModules();
    const assetUrl = (await import("./asset-url.js")).assetUrl;
    expect(assetUrl("uploads/abc123.png")).toBe("https://cdn.example.com/uploads/abc123.png");
  });
});

describe("assetUrl — proxied through the API (Production Hardening Phase 7: object storage configured, no public URL base)", () => {
  async function freshAssetUrl() {
    process.env.OBJECT_STORAGE_BUCKET = "test-bucket";
    delete process.env.OBJECT_STORAGE_PUBLIC_URL_BASE;
    vi.resetModules();
    return (await import("./asset-url.js")).assetUrl;
  }

  it("keeps the full storage key (not just the basename) under /assets/, matching app.ts's proxy route", async () => {
    const assetUrl = await freshAssetUrl();
    expect(assetUrl("uploads/abc123.png")).toBe("/assets/uploads/abc123.png");
  });
});
