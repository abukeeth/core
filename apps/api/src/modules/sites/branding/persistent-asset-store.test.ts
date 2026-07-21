import { describe, expect, it } from "vitest";
import type { GeneratedImage } from "../../../lib/ai/image";
import { ObjectStorageBrandAssetStore, type BlobBackend } from "./persistent-asset-store";

/** Durable, shared blob backing — a second store instance over the same map models a process restart. */
class MapBlobBackend implements BlobBackend {
  readonly store = new Map<string, Buffer>();
  async exists(key: string) {
    return this.store.has(key);
  }
  async put(key: string, data: Buffer) {
    this.store.set(key, data);
  }
  url(key: string) {
    return `/assets/${key}`;
  }
}

const IMG: GeneratedImage = { data: Buffer.from("<svg/>"), mediaType: "image/svg+xml" };
const meta = { businessId: "b1", surface: "hero" };

describe("ObjectStorageBrandAssetStore", () => {
  it("persists on put and reads back on get (cache HIT) with provenance + cache key", async () => {
    const backend = new MapBlobBackend();
    const store = new ObjectStorageBrandAssetStore(backend);

    const put = await store.put("key-abc", IMG, meta);
    expect(put.source).toBe("ai_generated");
    expect(put.cacheKey).toBe("key-abc");
    expect(backend.store.has("brand-assets/key-abc")).toBe(true);

    const got = await store.get("key-abc");
    expect(got?.url).toBe("/assets/brand-assets/key-abc");
    expect(got?.source).toBe("ai_generated");
  });

  it("returns null on a cache MISS", async () => {
    const store = new ObjectStorageBrandAssetStore(new MapBlobBackend());
    expect(await store.get("never-stored")).toBeNull();
  });

  it("survives a process restart — a fresh store instance still finds the asset", async () => {
    const backend = new MapBlobBackend();
    await new ObjectStorageBrandAssetStore(backend).put("key-xyz", IMG, meta);

    // New store instance, same durable backing (= restart).
    const afterRestart = new ObjectStorageBrandAssetStore(backend);
    const got = await afterRestart.get("key-xyz");
    expect(got).not.toBeNull();
    expect(got?.storageKey).toBe("brand-assets/key-xyz");
  });
});
