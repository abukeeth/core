import { createHash } from "node:crypto";
import { getNumberEnv } from "../../../config/env";
import { generateImage, isImageGenerationEnabled, type GeneratedImage, type ImageGenerationRequest } from "../../../lib/ai/image";
import type { IdentityPack } from "../identity/identity-packs";
import type { BrandKit } from "./brand-kit";
import type { BrandAssetStore } from "./asset-store";
import { InMemoryBrandAssetStore } from "./asset-store";
import { PROMPT_VERSION, buildImageRequest, type ImageSurface, type MenuGrounding } from "./prompt-builder";

/**
 * Sprint 5.5 — brand-asset generation orchestrator.
 *
 * Generates the impression imagery for a business and returns the URLs that
 * populate the renderer's AI slots. Never generates product tiles or branded
 * products. Every surface is independently guarded: on a cache hit it reuses; on
 * a provider failure (refusal / timeout / rate-limit / any error) it simply
 * omits that surface, so the resolver falls back to curated stock → premium SVG.
 * Cost is capped per business and the whole thing is a no-op when the AI image
 * flag is off.
 *
 * Three-agency model: when identity packs are passed, ONE HERO PER IDENTITY is
 * generated (each with its own photography direction), so the three storefront
 * variations open on genuinely different photographs. Category banners and the
 * marketing banner stay shared — they live below the fold and shared caching
 * keeps the per-business budget honest.
 */

export interface BrandAssetUrls {
  /** Legacy single-hero slot (used when no identities are passed). */
  heroUrl?: string;
  /** Per-identity heroes, keyed by identity key (e.g. "artisan-craft"). */
  heroUrls: Record<string, string>;
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
  /** Real-menu grounding (business name + representative product names). */
  grounding?: MenuGrounding;
  /** One hero per identity pack — the approved three-agency model. */
  identities?: IdentityPack[];
  /** Hard cap on images per business; defaults to AI_IMAGE_MAX_PER_BUSINESS (12). */
  maxImages?: number;
}

export interface GenerateBrandAssetsDeps {
  store?: BrandAssetStore;
  /** Injectable image generation (defaults to the provider-agnostic lib/ai/image). */
  generate?: (request: ImageGenerationRequest, options: { vertical?: string }) => Promise<GeneratedImage>;
  /** Injectable feature-flag check (defaults to lib/ai/image). */
  isEnabled?: () => boolean;
}

// 3 identity heroes + 6 category banners + 1 marketing = 10 generated images
// on a full cache miss; the default budget leaves headroom for retries.
const DEFAULT_MAX_IMAGES = 12;
const MAX_CATEGORY_IMAGES = 6;

/** Stable, order-independent digest of the grounding so menu changes refresh imagery. */
function groundingDigest(grounding?: MenuGrounding): string {
  if (!grounding) return "";
  const products = [...(grounding.products ?? [])].sort().join(",");
  const categories = [...(grounding.categories ?? [])].sort().join(",");
  return `${grounding.businessName ?? ""}|${products}|${categories}`;
}

/**
 * Deterministic cache key: prompt-version × vertical × surface × identity ×
 * category × palette × grounding. Identity is in the key so each variation's
 * hero is a DIFFERENT stored asset; grounding is in the key so a changed menu
 * produces fresh, still-true imagery.
 */
function cacheKey(brandKit: BrandKit, surface: ImageSurface, opts: { categoryName?: string; identityKey?: string; grounding?: MenuGrounding }): string {
  const palette = `${brandKit.palette.background}|${brandKit.palette.primary}|${brandKit.palette.accent}`;
  const raw = [PROMPT_VERSION, brandKit.vertical, surface, opts.identityKey ?? "", opts.categoryName ?? "", palette, groundingDigest(opts.grounding)].join("::");
  return createHash("sha1").update(raw).digest("hex").slice(0, 20);
}

export async function generateBrandAssets(input: GenerateBrandAssetsInput, deps: GenerateBrandAssetsDeps = {}): Promise<BrandAssetUrls> {
  const store = deps.store ?? new InMemoryBrandAssetStore();
  const generate = deps.generate ?? generateImage;
  const isEnabled = deps.isEnabled ?? isImageGenerationEnabled;

  const result: BrandAssetUrls = { heroUrls: {}, categoryImages: {}, generated: 0 };
  if (!isEnabled()) return result; // safe no-op → resolver falls back to stock/SVG

  const budget = input.maxImages ?? getNumberEnv("AI_IMAGE_MAX_PER_BUSINESS", DEFAULT_MAX_IMAGES);
  let used = 0;

  /**
   * Resolve one surface: cache-hit reuses (no generation, no budget spent); a
   * miss generates within budget and stores; any failure returns undefined so
   * the caller omits the surface (safe fallback). Returns the URL or undefined.
   */
  const resolveSurface = async (surface: ImageSurface, opts: { categoryName?: string; identity?: IdentityPack } = {}): Promise<string | undefined> => {
    const key = cacheKey(input.brandKit, surface, { categoryName: opts.categoryName, identityKey: opts.identity?.key, grounding: input.grounding });
    const cached = await store.get(key);
    if (cached) return cached.url;
    if (used >= budget) return undefined; // cost cap / budget guard

    try {
      const request = buildImageRequest(input.brandKit, surface, {
        categoryName: opts.categoryName,
        identity: opts.identity?.photography,
        grounding: input.grounding,
      });
      const image = await generate(request, { vertical: input.brandKit.vertical });
      const stored = await store.put(key, image, { businessId: input.businessId, surface, altText: opts.categoryName });
      used += 1;
      result.generated += 1;
      return stored.url;
    } catch {
      return undefined; // provider refusal / timeout / error → fall back
    }
  };

  if (input.identities && input.identities.length > 0) {
    for (const identity of input.identities) {
      const url = await resolveSurface("hero", { identity });
      if (url) result.heroUrls[identity.key] = url;
    }
    // Legacy single-hero consumers get the first identity's hero.
    result.heroUrl = result.heroUrls[input.identities[0].key];
  } else {
    result.heroUrl = await resolveSurface("hero");
  }

  const categories = [...new Set(input.categories)].slice(0, MAX_CATEGORY_IMAGES);
  for (const category of categories) {
    const url = await resolveSurface("category", { categoryName: category });
    if (url) result.categoryImages[category] = url;
  }

  result.marketingUrl = await resolveSurface("marketing");

  return result;
}
