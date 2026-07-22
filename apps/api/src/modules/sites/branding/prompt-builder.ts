import type { ImageAspect, ImageGenerationRequest } from "../../../lib/ai/image";
import type { IdentityPhotography } from "../identity/identity-packs";
import type { BrandKit } from "./brand-kit";

/**
 * Sprint 5.5 — image prompt builder. Turns a Brand Kit's art-direction + palette
 * into a provider-agnostic ImageGenerationRequest for an impression surface.
 * Only hero / category / marketing surfaces exist here — never product tiles and
 * never a specific/branded product (enforced via the negative prompt), per the
 * product-image and branded-SKU policies.
 *
 * Identity + grounding (approved three-agency model): every prompt is grounded
 * in the REAL business — its name, resolved vertical, menu categories and actual
 * product names — and carries the variation's photography direction, so an
 * Artisan Craft deli hero (low-key pastrami on dark slate) and a Modern Minimal
 * one (bright sandwich on seamless white) are different photographs of the SAME
 * true menu. No more attractive-but-unrelated imagery.
 */

export type ImageSurface = "hero" | "category" | "marketing";

/** Bump when prompt construction changes materially — it participates in cache keys. */
export const PROMPT_VERSION = "v2";

const SURFACE_ASPECT: Record<ImageSurface, ImageAspect> = {
  hero: "landscape",
  category: "portrait",
  marketing: "landscape",
};

const PRODUCT_SAFETY = "no product packaging, no specific branded products, no labels";

/** Real-menu grounding for a prompt — always from the imported menu, never invented. */
export interface MenuGrounding {
  businessName?: string;
  /** A few representative real product names (e.g. "Pastrami on Rye"). */
  products?: string[];
  /** Real category names, used to ground the hero/marketing spread. */
  categories?: string[];
}

function groundingLine(surface: ImageSurface, grounding: MenuGrounding | undefined): string | undefined {
  if (!grounding) return undefined;
  const products = (grounding.products ?? []).slice(0, 3);
  if (surface === "category") {
    // The category surface is already named; add its real products when known.
    return products.length > 0 ? `representative items: ${products.join(", ")}` : undefined;
  }
  const parts: string[] = [];
  if (products.length > 0) parts.push(`featuring ${products.join(", ")}`);
  const categories = (grounding.categories ?? []).slice(0, 4);
  if (categories.length > 0) parts.push(`from a menu of ${categories.join(", ")}`);
  return parts.length > 0 ? parts.join("; ") : undefined;
}

export function buildImageRequest(
  brandKit: BrandKit,
  surface: ImageSurface,
  options: { categoryName?: string; seed?: number; identity?: IdentityPhotography; grounding?: MenuGrounding } = {},
): ImageGenerationRequest {
  const brief = brandKit.artDirection[surface];
  const subject = surface === "category" && options.categoryName ? `${options.categoryName} — ${brief.subject}` : brief.subject;
  const palette = `on-brand palette (background ${brandKit.palette.background}, primary ${brandKit.palette.primary}, accent ${brandKit.palette.accent})`;
  const tone = brandKit.tone.adjectives.join(", ");

  const identity = options.identity;
  const grounded = groundingLine(surface, options.grounding);

  const prompt = [
    subject,
    grounded,
    `${brief.mood}; ${tone} feel`,
    // The identity's photography direction REPLACES the generic lighting brief
    // so each variation is a different shoot, not the same photo re-lit.
    identity ? identity.treatment : undefined,
    identity ? `${identity.lighting}, ${identity.backdrop}` : brief.lighting,
    brief.composition,
    palette,
    "professional atmospheric brand photography, no text",
  ]
    .filter((part): part is string => Boolean(part))
    .join(". ");

  return {
    prompt,
    negativePrompt: `${brief.negativePrompt}, ${PRODUCT_SAFETY}`,
    aspect: SURFACE_ASPECT[surface],
    seed: options.seed,
  };
}
