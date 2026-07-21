import { describe, expect, it, vi } from "vitest";
import { ImageGenerationError, type GeneratedImage } from "../../../lib/ai/image";
import type { BrandKit } from "./brand-kit";
import { InMemoryBrandAssetStore } from "./asset-store";
import { generateBrandAssets } from "./asset-generator";
import { getVerticalProfile } from "./vertical-profiles";

function brandKit(vertical = "VAPE_SHOP"): BrandKit {
  const p = getVerticalProfile(vertical);
  return { vertical, palette: p.palette, vocabulary: p.vocabulary, tone: p.tone, tagline: "t", brandStory: "s", artDirection: p.artDirection, source: "fallback" };
}

const PNG: GeneratedImage = { data: Buffer.from("PNG"), mediaType: "image/png" };
const enabled = () => true;

describe("generateBrandAssets", () => {
  it("is a safe no-op when AI image generation is disabled (fallback to stock/SVG)", async () => {
    const generate = vi.fn(async () => PNG);
    const result = await generateBrandAssets(
      { brandKit: brandKit(), businessId: "b1", categories: ["Disposables"] },
      { isEnabled: () => false, generate, store: new InMemoryBrandAssetStore() },
    );
    expect(result.heroUrl).toBeUndefined();
    expect(result.categoryImages).toEqual({});
    expect(result.generated).toBe(0);
    expect(generate).not.toHaveBeenCalled();
  });

  it("cache MISS: generates and stores hero + category + marketing", async () => {
    const generate = vi.fn(async () => PNG);
    const store = new InMemoryBrandAssetStore();
    const result = await generateBrandAssets({ brandKit: brandKit(), businessId: "b1", categories: ["Disposables", "E-Liquids"] }, { isEnabled: enabled, generate, store });
    expect(result.heroUrl).toBeDefined();
    expect(Object.keys(result.categoryImages)).toEqual(["Disposables", "E-Liquids"]);
    expect(result.marketingUrl).toBeDefined();
    expect(result.generated).toBe(4); // hero + 2 categories + marketing
    expect(store.size()).toBe(4);
  });

  it("cache HIT: a second run reuses stored assets and generates nothing (reuse across variations/renders)", async () => {
    const generate = vi.fn(async () => PNG);
    const store = new InMemoryBrandAssetStore();
    const input = { brandKit: brandKit(), businessId: "b1", categories: ["Disposables"] };
    await generateBrandAssets(input, { isEnabled: enabled, generate, store });
    const callsAfterFirst = generate.mock.calls.length;

    const second = await generateBrandAssets(input, { isEnabled: enabled, generate, store });
    expect(generate.mock.calls.length).toBe(callsAfterFirst); // no new generation
    expect(second.generated).toBe(0);
    expect(second.heroUrl).toBeDefined(); // still resolved, from cache
  });

  it("provider REFUSAL (content_rejected) omits that surface so the resolver falls back", async () => {
    const generate = vi.fn(async () => {
      throw new ImageGenerationError("content_rejected", "policy", false);
    });
    const result = await generateBrandAssets({ brandKit: brandKit(), businessId: "b1", categories: ["Disposables"] }, { isEnabled: enabled, generate, store: new InMemoryBrandAssetStore() });
    expect(result.heroUrl).toBeUndefined();
    expect(result.categoryImages).toEqual({});
    expect(result.generated).toBe(0);
  });

  it("TIMEOUT omits the surface (safe fallback), other surfaces are independent", async () => {
    // hero times out; categories succeed.
    let call = 0;
    const generate = vi.fn(async () => {
      call += 1;
      if (call === 1) throw new ImageGenerationError("timeout", "slow", true);
      return PNG;
    });
    const result = await generateBrandAssets({ brandKit: brandKit(), businessId: "b1", categories: ["Disposables"] }, { isEnabled: enabled, generate, store: new InMemoryBrandAssetStore() });
    expect(result.heroUrl).toBeUndefined();
    expect(result.categoryImages.Disposables).toBeDefined();
  });

  it("an unexpected error also falls back for that surface", async () => {
    const generate = vi.fn(async () => {
      throw new Error("boom");
    });
    const result = await generateBrandAssets({ brandKit: brandKit(), businessId: "b1", categories: ["Disposables"] }, { isEnabled: enabled, generate, store: new InMemoryBrandAssetStore() });
    expect(result.heroUrl).toBeUndefined();
  });

  it("respects the per-business cost CAP", async () => {
    const generate = vi.fn(async () => PNG);
    const result = await generateBrandAssets(
      { brandKit: brandKit(), businessId: "b1", categories: ["A", "B", "C", "D"], maxImages: 2 },
      { isEnabled: enabled, generate, store: new InMemoryBrandAssetStore() },
    );
    expect(result.generated).toBe(2); // hero + 1 category, then budget exhausted
    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.marketingUrl).toBeUndefined();
  });
});
