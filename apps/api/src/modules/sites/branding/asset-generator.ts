import { createHash } from "node:crypto";
import { getNumberEnv } from "../../../config/env";
import { generateImage, isImageGenerationEnabled, type GeneratedImage, type ImageGenerationRequest } from "../../../lib/ai/image";
import type { BrandKit } from "./brand-kit";
import type { BrandAssetStore } from "./asset-store";
import { InMemoryBrandAssetStore } from "./asset-store";
import { PROMPT_VERSION, buildImageRequest, type ImageSurface } from "./prompt-builder";

/**
 * Sprint 5.5 — brand-asset generation orchestrator.
 *
 * Generates the impression imagery (hero + category banners + one marketing
 * banner) for a business, once, and returns the URLs that populate the renderer's
 * AI slots. Never generates product tiles or branded products. Every surface is
 * independently guarded: on a cache hit it reuses; on a provider failure
 * (refusal / timeout / rate-limit / any error) it simply omits that surface, so
 * the resolver falls back to curated stock → premium SVG. Cost is capped per
 * business and the whole thing is a no-op when the AI image flag is off.
 */

export interface BrandAssetUrls {
  heroUrl?: string;
  /** Keyed by category name → banner URL. */
  categoryImages: Record<string, string>;
  marketingUrl?: string;
  /** How many images were actually generated (cache misses that succeeded). */
  generated: number;
}

export interface GenerateBrandAssetsInput {
  brandKit: BrandKit;
  businessId: string;
  /** Category names to generate banners for (deduped + capped by the budget). */
  categories: string[];
  /** Hard cap on images per business; defaults to AI_IMAGE_MAX_PER_BUSINESS (10). */
  maxImages?: number;
}

export interface GenerateBrandAssetsDeps {
  store?: BrandAssetStore;
  /** Injectable image generation (defaults to the provider-agnostic lib/ai/image). */
  generate?: (request: ImageGenerationRequest, options: { vertical?: string }) => Promise<GeneratedImage>;
  /** Injectable feature-flag check (defaults to lib/ai/image). */
  isEnabled?: () => boolean;
}

const DEFAULT_MAX_IMAGES = 10;
const MAX_CATEGORY_IMAGES = 8;

/** Deterministic cache key: same vertical × surface × palette × prompt-version → same asset (cross-business + per-business). */
function cacheKey(brandKit: BrandKit, surface: ImageSurface, categoryName?: string): string {
  const palette = `${brandKit.palette.background}|${brandKit.palette.primary}|${brandKit.palette.accent}`;
  const raw = [PROMPT_VERSION, brandKit.vertical, surface, categoryName ?? "", palette].join("::");
  return createHash("sha1").update(raw).digest("hex").slice(0, 20);
}

export async function generateBrandAssets(input: GenerateBrandAssetsInput, deps: GenerateBrandAssetsDeps = {}): Promise<BrandAssetUrls> {
  const store = deps.store ?? new InMemoryBrandAssetStore();
  const generate = deps.generate ?? generateImage;
  const isEnabled = deps.isEnabled ?? isImageGenerationEnabled;

  const result: BrandAssetUrls = { categoryImages: {}, generated: 0 };
  if (!isEnabled()) return result; // safe no-op → resolver falls back to stock/SVG

  const budget = input.maxImages ?? getNumberEnv("AI_IMAGE_MAX_PER_BUSINESS", DEFAULT_MAX_IMAGES);
  let used = 0;

  /**
   * Resolve one surface: cache-hit reuses (no generation, no budget spent); a
   * miss generates within budget and stores; any failure returns undefined so
   * the caller omits the surface (safe fallback). Returns the URL or undefined.
   */
  const resolveSurface = async (surface: ImageSurface, categoryName?: string): Promise<string | undefined> => {
    const key = cacheKey(input.brandKit, surface, categoryName);
    const cached = await store.get(key);
    if (cached) return cached.url;
    if (used >= budget) return undefined; // cost cap / budget guard

    try {
      const request = buildImageRequest(input.brandKit, surface, { categoryName });
      const image = await generate(request, { vertical: input.brandKit.vertical });
      const stored = await store.put(key, image, { businessId: input.businessId, surface, altText: categoryName });
      used += 1;
      result.generated += 1;
      return stored.url;
    } catch {
      return undefined; // provider refusal / timeout / error → fall back
    }
  };

  result.heroUrl = await resolveSurface("hero");

  const categories = [...new Set(input.categories)].slice(0, MAX_CATEGORY_IMAGES);
  for (const category of categories) {
    const url = await resolveSurface("category", category);
    if (url) result.categoryImages[category] = url;
  }

  result.marketingUrl = await resolveSurface("marketing");

  return result;
}
