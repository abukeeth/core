import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
  vi.doUnmock("@aws-sdk/client-s3");
});

describe("isObjectStorageConfigured", () => {
  it("is false when OBJECT_STORAGE_BUCKET is unset", async () => {
    delete process.env.OBJECT_STORAGE_BUCKET;
    vi.resetModules();
    const { isObjectStorageConfigured } = await import("./object-storage-client.js");
    expect(isObjectStorageConfigured()).toBe(false);
  });

  it("is true when OBJECT_STORAGE_BUCKET is set", async () => {
    process.env.OBJECT_STORAGE_BUCKET = "test-bucket";
    vi.resetModules();
    const { isObjectStorageConfigured } = await import("./object-storage-client.js");
    expect(isObjectStorageConfigured()).toBe(true);
  });
});

describe("getObjectStorageBucket", () => {
  it("throws a clear error when unset", async () => {
    delete process.env.OBJECT_STORAGE_BUCKET;
    vi.resetModules();
    const { getObjectStorageBucket } = await import("./object-storage-client.js");
    expect(() => getObjectStorageBucket()).toThrow(/OBJECT_STORAGE_BUCKET/);
  });

  it("returns the configured bucket name", async () => {
    process.env.OBJECT_STORAGE_BUCKET = "my-bucket";
    vi.resetModules();
    const { getObjectStorageBucket } = await import("./object-storage-client.js");
    expect(getObjectStorageBucket()).toBe("my-bucket");
  });
});

describe("getS3Client", () => {
  beforeEach(() => {
    process.env.OBJECT_STORAGE_BUCKET = "test-bucket";
    process.env.OBJECT_STORAGE_ACCESS_KEY_ID = "key";
    process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY = "secret";
  });

  it("throws when credentials are missing", async () => {
    delete process.env.OBJECT_STORAGE_ACCESS_KEY_ID;
    vi.resetModules();
    const { getS3Client } = await import("./object-storage-client.js");
    expect(() => getS3Client()).toThrow(/OBJECT_STORAGE_ACCESS_KEY_ID/);
  });

  it("memoizes — a second call returns the same client instance", async () => {
    vi.resetModules();
    const { getS3Client } = await import("./object-storage-client.js");
    const first = getS3Client();
    const second = getS3Client();
    expect(second).toBe(first);
  });

  it("__resetS3ClientForTests forces a fresh client on the next call", async () => {
    vi.resetModules();
    const { getS3Client, __resetS3ClientForTests } = await import("./object-storage-client.js");
    const first = getS3Client();
    __resetS3ClientForTests();
    const second = getS3Client();
    expect(second).not.toBe(first);
  });

  it("enables forcePathStyle only when OBJECT_STORAGE_ENDPOINT is set (non-AWS providers)", async () => {
    const seenConfigs: Array<{ endpoint?: string; forcePathStyle?: boolean }> = [];
    vi.doMock("@aws-sdk/client-s3", () => ({
      S3Client: class {
        constructor(config: { endpoint?: string; forcePathStyle?: boolean }) {
          seenConfigs.push(config);
        }
      },
    }));

    process.env.OBJECT_STORAGE_ENDPOINT = "http://localhost:9000";
    vi.resetModules();
    const { getS3Client: getClientWithEndpoint } = await import("./object-storage-client.js");
    getClientWithEndpoint();
    expect(seenConfigs[0].forcePathStyle).toBe(true);
    expect(seenConfigs[0].endpoint).toBe("http://localhost:9000");

    delete process.env.OBJECT_STORAGE_ENDPOINT;
    vi.resetModules();
    const { getS3Client: getClientWithoutEndpoint } = await import("./object-storage-client.js");
    getClientWithoutEndpoint();
    expect(seenConfigs[1].forcePathStyle).toBeUndefined();
    expect(seenConfigs[1].endpoint).toBeUndefined();
  });
});
