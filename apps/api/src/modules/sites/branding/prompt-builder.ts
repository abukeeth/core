import type { ImageAspect, ImageGenerationRequest } from "../../../lib/ai/image";
import type { BrandKit } from "./brand-kit";

/**
 * Sprint 5.5 — image prompt builder. Turns a Brand Kit's art-direction + palette
 * into a provider-agnostic ImageGenerationRequest for an impression surface.
 * Only hero / category / marketing surfaces exist here — never product tiles and
 * never a specific/branded product (enforced via the negative prompt), per the
 * product-image and branded-SKU policies.
 */

export type ImageSurface = "hero" | "category" | "marketing";

/** Bump when prompt construction changes materially — it participates in cache keys. */
export const PROMPT_VERSION = "v1";

const SURFACE_ASPECT: Record<ImageSurface, ImageAspect> = {
  hero: "landscape",
  category: "portrait",
  marketing: "landscape",
};

const PRODUCT_SAFETY = "no product packaging, no specific branded products, no labels";

export function buildImageRequest(
  brandKit: BrandKit,
  surface: ImageSurface,
  options: { categoryName?: string; seed?: number } = {},
): ImageGenerationRequest {
  const brief = brandKit.artDirection[surface];
  const subject = surface === "category" && options.categoryName ? `${options.categoryName} — ${brief.subject}` : brief.subject;
  const palette = `on-brand palette (background ${brandKit.palette.background}, primary ${brandKit.palette.primary}, accent ${brandKit.palette.accent})`;
  const tone = brandKit.tone.adjectives.join(", ");

  const prompt = [
    subject,
    `${brief.mood}; ${tone} feel`,
    brief.lighting,
    brief.composition,
    palette,
    "professional atmospheric brand photography, no text",
  ].join(". ");

  return {
    prompt,
    negativePrompt: `${brief.negativePrompt}, ${PRODUCT_SAFETY}`,
    aspect: SURFACE_ASPECT[surface],
    seed: options.seed,
  };
}
