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

export const V2_PROMPT_VERSION = "v2p2";

/** Per-storefront category images (top categories only — below-the-fold cost control). */
const CATEGORY_IMAGES_PER_STOREFRONT = 3;
const DEFAULT_MAX_IMAGES = 15; // 3 × (1 hero + 3 categories) on a full miss, plus headroom

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

/** Pure planning — the full imagery program, before any generation happens. */
export function planAssets(u: BusinessUnderstanding, briefs: CreativeBrief[]): GeneratedAssetPlan {
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
    budget: getNumberEnv("AI_IMAGE_MAX_PER_BUSINESS", DEFAULT_MAX_IMAGES),
  });
}

export interface StorefrontAssets {
  briefId: string;
  heroUrl?: string;
  categoryImages: Record<string, string>;
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

  const results: StorefrontAssets[] = plan.perStorefront.map((s) => ({ briefId: s.briefId, categoryImages: {} }));
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
  return results;
}
