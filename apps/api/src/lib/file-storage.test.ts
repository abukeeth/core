import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.resetModules();
  vi.doUnmock("@aws-sdk/client-s3");
  vi.doUnmock("./object-storage-client.js");
});

describe("fileStorage — local disk (Production Hardening Phase 7: OBJECT_STORAGE_BUCKET unset)", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(os.tmpdir(), `file-storage-test-${randomUUID()}`);
    process.env.IMPORT_UPLOAD_DIR = testDir;
    delete process.env.OBJECT_STORAGE_BUCKET;
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("round-trips saved bytes: save then read returns byte-for-byte identical content", async () => {
    vi.resetModules();
    const { fileStorage } = await import("./file-storage.js");
    const original = Buffer.from("hello world, this is a test file");
    const { path: storedPath } = await fileStorage.save(original, "menu.pdf");
    const readBack = await fileStorage.read(storedPath);
    expect(readBack).toEqual(original);
  });

  it("preserves the file extension and generates a unique name per save", async () => {
    vi.resetModules();
    const { fileStorage } = await import("./file-storage.js");
    const a = await fileStorage.save(Buffer.from("a"), "photo.png");
    const b = await fileStorage.save(Buffer.from("b"), "photo.png");
    expect(a.path).toMatch(/\.png$/);
    expect(a.path).not.toBe(b.path);
  });
});

describe("fileStorage — S3-backed (Production Hardening Phase 7: OBJECT_STORAGE_BUCKET set)", () => {
  const store = new Map<string, Buffer>();

  beforeEach(() => {
    store.clear();
    process.env.OBJECT_STORAGE_BUCKET = "test-bucket";
    process.env.OBJECT_STORAGE_REGION = "us-east-1";
    process.env.OBJECT_STORAGE_ACCESS_KEY_ID = "test-access-key";
    process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY = "test-secret-key";

    vi.doMock("@aws-sdk/client-s3", () => {
      class FakePutObjectCommand {
        constructor(public input: { Bucket: string; Key: string; Body: Buffer }) {}
      }
      class FakeGetObjectCommand {
        constructor(public input: { Bucket: string; Key: string }) {}
      }
      class FakeS3Client {
        async send(command: FakePutObjectCommand | FakeGetObjectCommand) {
          if (command instanceof FakePutObjectCommand) {
            store.set(command.input.Key, Buffer.from(command.input.Body));
            return {};
          }
          const bytes = store.get(command.input.Key);
          if (!bytes) {
            const err = new Error("NoSuchKey");
            err.name = "NoSuchKey";
            throw err;
          }
          return { Body: { transformToByteArray: async () => new Uint8Array(bytes) } };
        }
      }
      return { S3Client: FakeS3Client, PutObjectCommand: FakePutObjectCommand, GetObjectCommand: FakeGetObjectCommand };
    });
  });

  it("round-trips saved bytes through the (mocked) S3 client: save then read returns byte-for-byte identical content", async () => {
    vi.resetModules();
    const { fileStorage } = await import("./file-storage.js");
    const original = Buffer.from("hello from object storage");
    const { path: key } = await fileStorage.save(original, "menu.pdf");
    expect(key).toMatch(/^uploads\/.+\.pdf$/);
    const readBack = await fileStorage.read(key);
    expect(readBack).toEqual(original);
  });

  it("throws a clear error rather than returning garbage when the object body is unexpectedly empty", async () => {
    vi.resetModules();
    vi.doMock("@aws-sdk/client-s3", () => {
      class FakePutObjectCommand {
        constructor(public input: unknown) {}
      }
      class FakeGetObjectCommand {
        constructor(public input: unknown) {}
      }
      class FakeS3Client {
        async send() {
          return { Body: undefined };
        }
      }
      return { S3Client: FakeS3Client, PutObjectCommand: FakePutObjectCommand, GetObjectCommand: FakeGetObjectCommand };
    });
    const { fileStorage } = await import("./file-storage.js");
    await expect(fileStorage.read("uploads/missing.png")).rejects.toThrow(/empty body/);
  });
});
