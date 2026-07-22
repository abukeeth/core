import { createHash } from "node:crypto";
import { getNumberEnv } from "../../../../config/env";
import { generateImage, isImageGenerationEnabled, type GeneratedImage, type ImageGenerationRequest } from "../../../../lib/ai/image";
import { getVerticalProfile } from "../../branding/vertical-profiles";
import type { BrandAssetStore } from "../../branding/asset-store";
import { InMemoryBrandAssetStore } from "../../branding/asset-store";
import { generatedAssetPlanSchema, type BusinessUnderstanding, type CreativeBrief, type GeneratedAssetPlan } from "../contracts";

/**
 * Generation V2 — per-storefront imagery (P2).
 *
 * Every storefront's imagery is planned from ITS OWN brief: the hero and the
 * category images all carry the brief's photography direction plus the real
 * business grounding (name, categories, product names). Cache keys include
 * the brief hash, so no two storefronts can ever share an asset — sharing is
 * structurally impossible, not just discouraged. Vertical safety negatives
 * (e.g. no cigarettes for nicotine retail) come from the vertical profile —
 * a compliance rail, not an art decision.
 */

export const V2_PROMPT_VERSION = "v2p3";

/** Per-storefront category images (top categories only — below-the-fold cost control). */
const CATEGORY_IMAGES_PER_STOREFRONT = 3;
/** Product photos per business (flagships first) — shared across storefronts. */
const MAX_PRODUCT_IMAGES = 10;
const DEFAULT_MAX_IMAGES = 24; // 3×(1 hero + 3 categories) + 10 products on a full miss, plus headroom

function briefHash(brief: CreativeBrief): string {
  return createHash("sha1").update(JSON.stringify(brief)).digest("hex").slice(0, 12);
}

function groundingLine(u: BusinessUnderstanding): string {
  const products = u.catalog.flagshipProducts.slice(0, 3).join(", ");
  const categories = u.catalog.categories.slice(0, 4).map((c) => c.name).join(", ");
  return `for ${u.identity.name}; featuring ${products}; from a menu of ${categories}`;
}

function heroPrompt(u: BusinessUnderstanding, brief: CreativeBrief): { prompt: string; negativePrompt: string } {
  const safety = getVerticalProfile(u.identity.resolvedVertical).artDirection.hero.negativePrompt;
  return {
    prompt: [
      brief.heroConcept.imageSubject,
      groundingLine(u),
      brief.photography.treatment,
      `${brief.photography.lighting}, ${brief.photography.backdrop}`,
      `on-brand palette (ground ${brief.colorLogic.ground.hex}, brand ${brief.colorLogic.brand}, accent ${brief.colorLogic.accent})`,
      "professional brand photography, no text",
    ].join(". "),
    negativePrompt: `${safety}, no product packaging, no specific branded products, no labels`,
  };
}

function categoryPrompt(u: BusinessUnderstanding, brief: CreativeBrief, categoryName: string): { prompt: string; negativePrompt: string } {
  const safety = getVerticalProfile(u.identity.resolvedVertical).artDirection.category.negativePrompt;
  const representative = u.catalog.categories.find((c) => c.name === categoryName)?.representativeItems.slice(0, 2).join(", ");
  return {
    prompt: [
      `${categoryName} at ${u.identity.name}`,
      representative ? `representative items: ${representative}` : undefined,
      brief.photography.treatment,
      `${brief.photography.lighting}, ${brief.photography.backdrop}`,
      "professional brand photography, no text",
    ]
      .filter(Boolean)
      .join(". "),
    negativePrompt: `${safety}, no product packaging, no specific branded products, no labels`,
  };
}

function cacheKeyFor(brief: CreativeBrief, surface: string, categoryName?: string): string {
  return createHash("sha1")
    .update([V2_PROMPT_VERSION, briefHash(brief), surface, categoryName ?? ""].join("::"))
    .digest("hex")
    .slice(0, 20);
}

/** Product photos are business truth — keyed by the item itself (name +
 * description + vertical), NOT by any brief, so all three storefronts show
 * the same true photo of the same real item. */
function productCacheKey(u: BusinessUnderstanding, name: string, description?: string): string {
  return createHash("sha1")
    .update([V2_PROMPT_VERSION, "product", u.identity.resolvedVertical, name, description ?? ""].join("::"))
    .digest("hex")
    .slice(0, 20);
}

export interface ProductForImaging {
  name: string;
  description?: string;
  categoryName?: string;
}

function productPrompt(u: BusinessUnderstanding, item: ProductForImaging): { prompt: string; negativePrompt: string } {
  const safety = getVerticalProfile(u.identity.resolvedVertical).artDirection.category.negativePrompt;
  return {
    prompt: [
      `${item.name}${item.description ? ` — ${item.description}` : ""}`,
      item.categoryName ? `(${item.categoryName})` : undefined,
      "appetizing single-product photography, true to the item, centered, clean neutral surface, soft natural light",
      "professional menu photography, no text",
    ]
      .filter(Boolean)
      .join(". "),
    negativePrompt: `${safety}, no product packaging, no brand logos, no labels, no hands`,
  };
}

/** Pure planning — the full imagery program, before any generation happens. */
export function planAssets(u: BusinessUnderstanding, briefs: CreativeBrief[], products: ProductForImaging[] = []): GeneratedAssetPlan {
  // Flagships first, then menu order; one photo per real item.
  const ranked = [...products].sort((a, b) => {
    const ai = u.catalog.flagshipProducts.indexOf(a.name);
    const bi = u.catalog.flagshipProducts.indexOf(b.name);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
  return generatedAssetPlanSchema.parse({
    schemaVersion: 1,
    perStorefront: briefs.map((brief) => {
      const hero = heroPrompt(u, brief);
      return {
        briefId: brief.id,
        hero: { surface: "hero", ...hero, aspect: "landscape", cacheKey: cacheKeyFor(brief, "hero") },
        categoryImages: u.catalog.categories.slice(0, CATEGORY_IMAGES_PER_STOREFRONT).map((c) => ({
          surface: "category",
          categoryName: c.name,
          ...categoryPrompt(u, brief, c.name),
          aspect: "portrait",
          cacheKey: cacheKeyFor(brief, "category", c.name),
        })),
      };
    }),
    productImages: ranked.slice(0, MAX_PRODUCT_IMAGES).map((item) => ({
      surface: "product",
      productName: item.name,
      ...productPrompt(u, item),
      aspect: "square",
      cacheKey: productCacheKey(u, item.name, item.description),
    })),
    budget: getNumberEnv("AI_IMAGE_MAX_PER_BUSINESS", DEFAULT_MAX_IMAGES),
  });
}

export interface StorefrontAssets {
  briefId: string;
  heroUrl?: string;
  categoryImages: Record<string, string>;
  /** Shared, business-truth product photos (item name → url). */
  productImages: Record<string, string>;
}

export interface GenerateAssetsDeps {
  store?: BrandAssetStore;
  generate?: (request: ImageGenerationRequest, options: { vertical?: string }) => Promise<GeneratedImage>;
  isEnabled?: () => boolean;
}

/** Executes an asset plan with the same guardrails as V1 (cache, budget, safe omission on failure). */
export async function generatePlannedAssets(
  u: BusinessUnderstanding,
  plan: GeneratedAssetPlan,
  businessId: string,
  deps: GenerateAssetsDeps = {},
): Promise<StorefrontAssets[]> {
  const store = deps.store ?? new InMemoryBrandAssetStore();
  const generate = deps.generate ?? generateImage;
  const isEnabled = deps.isEnabled ?? isImageGenerationEnabled;

  const results: StorefrontAssets[] = plan.perStorefront.map((s) => ({ briefId: s.briefId, categoryImages: {}, productImages: {} }));
  if (!isEnabled()) return results; // renderer fallbacks take over

  let used = 0;
  const resolve = async (cacheKey: string, request: ImageGenerationRequest, surface: string, altText?: string): Promise<string | undefined> => {
    const cached = await store.get(cacheKey);
    if (cached) return cached.url;
    if (used >= plan.budget) return undefined;
    try {
      const image = await generate(request, { vertical: u.identity.resolvedVertical });
      const stored = await store.put(cacheKey, image, { businessId, surface, altText });
      used += 1;
      return stored.url;
    } catch {
      return undefined;
    }
  };

  for (let i = 0; i < plan.perStorefront.length; i++) {
    const s = plan.perStorefront[i];
    results[i].heroUrl = await resolve(
      s.hero.cacheKey,
      { prompt: s.hero.prompt, negativePrompt: s.hero.negativePrompt, aspect: s.hero.aspect },
      "hero",
    );
    for (const c of s.categoryImages) {
      const url = await resolve(c.cacheKey, { prompt: c.prompt, negativePrompt: c.negativePrompt, aspect: c.aspect }, "category", c.categoryName);
      if (url && c.categoryName) results[i].categoryImages[c.categoryName] = url;
    }
  }

  // Product photos: generated ONCE, then shared into every storefront's assets.
  const sharedProducts: Record<string, string> = {};
  for (const p of plan.productImages) {
    const url = await resolve(p.cacheKey, { prompt: p.prompt, negativePrompt: p.negativePrompt, aspect: p.aspect }, "product", p.productName);
    if (url && p.productName) sharedProducts[p.productName] = url;
  }
  for (const r of results) r.productImages = sharedProducts;

  return results;
}
