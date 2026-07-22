import { z } from "zod";
import { getAIProvider, type AICompletionRequest } from "../../../../lib/ai";
import { sanitizeClaims } from "../../claims-filter";
import type { BusinessUnderstanding, CreativeBrief } from "../contracts";

/**
 * Generation V2 — per-storefront copy (P2).
 *
 * Every storefront gets INDEPENDENTLY written copy in its own brief's voice —
 * one completion per brief, never a shared master paragraph rewritten three
 * ways. The deterministic floor composes copy from the brief's own headline/
 * voice/strategy plus the business's real products, so even with AI off the
 * three storefronts never share a sentence.
 */

export interface StorefrontCopy {
  tagline: string;
  heroHeadline: string;
  heroSubhead: string;
  aboutStory: string;
  featuredTitle: string;
  featuredEyebrow: string;
  signatureIntro: string;
  galleryIntro: string;
  ctaBannerLabel: string;
}

const copySchema = z.object({
  tagline: z.string().min(1).max(140),
  heroHeadline: z.string().min(1).max(90),
  heroSubhead: z.string().min(1).max(160),
  aboutStory: z.string().min(1).max(600),
  featuredTitle: z.string().min(1).max(60),
  featuredEyebrow: z.string().min(1).max(30),
  signatureIntro: z.string().min(1).max(160),
  galleryIntro: z.string().min(1).max(160),
  ctaBannerLabel: z.string().min(1).max(40),
});

export interface CopyWriterDeps {
  complete?: (request: AICompletionRequest) => Promise<string>;
}

function clean(text: string, max: number): string {
  return sanitizeClaims(text).slice(0, max);
}

/** Deterministic floor — composed from the brief's own voice + real data. */
export function proceduralCopy(u: BusinessUnderstanding, brief: CreativeBrief): StorefrontCopy {
  const flagship = u.catalog.flagshipProducts[0] ?? "what we make";
  const topCategory = u.catalog.categories[0]?.name ?? "the menu";
  return copySchema.parse({
    tagline: clean(`${u.identity.name} — ${brief.valueProposition}`, 140),
    heroHeadline: clean(brief.heroConcept.headline, 90),
    heroSubhead: clean(brief.heroConcept.subhead, 160),
    aboutStory: clean(
      [
        `${u.identity.name} — ${brief.valueProposition.replace(/\.$/, "")}.`,
        // The owner's own words when they gave any; never the synthetic
        // "<vertical>, <tier> tier" fallback string.
        u.sourceSignals.description ? `${u.sourceSignals.description.replace(/\.$/, "")}.` : undefined,
        `Known for ${flagship.toLowerCase().startsWith("the ") ? flagship : `the ${flagship}`}.`,
      ]
        .filter(Boolean)
        .join(" "),
      600,
    ),
    featuredTitle: clean(brief.productPresentation.emphasis.length <= 60 ? toTitle(brief.productPresentation.emphasis) : topCategory, 60),
    featuredEyebrow: clean(brief.brandPersonality[0] ?? "Featured", 30),
    signatureIntro: clean(`${brief.valueProposition}`, 160),
    galleryIntro: clean(`A look at ${u.identity.name.toLowerCase().startsWith("the") ? u.identity.name : `${u.identity.name}`}, up close.`, 160),
    ctaBannerLabel: clean(brief.conversionStrategy.primaryCta, 40),
  });
}

function toTitle(text: string): string {
  const first = text.split(/[;.]/)[0].trim();
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function buildPrompt(u: BusinessUnderstanding, brief: CreativeBrief): string {
  return [
    `You are the copywriter for ONE storefront direction. Write in EXACTLY this voice: "${brief.copyVoice.voice}".`,
    `Direction: ${brief.centralIdea}. Target: ${brief.targetCustomer}. Value: ${brief.valueProposition}.`,
    `Business facts (use real product/category names; never invent items, awards, or claims):`,
    JSON.stringify({ name: u.identity.name, positioning: u.identity.positioning, flagships: u.catalog.flagshipProducts, categories: u.catalog.categories.map((c) => c.name) }),
    `Sample headline for tone: "${brief.copyVoice.sampleHeadline}". Primary CTA: "${brief.conversionStrategy.primaryCta}".`,
    `NEVER use the words: theme, template, variation, identity, brief, archetype, AI.`,
    `Reply ONLY with JSON: {"tagline","heroHeadline","heroSubhead","aboutStory","featuredTitle","featuredEyebrow","signatureIntro","galleryIntro","ctaBannerLabel"}.`,
  ].join("\n");
}

export async function writeStorefrontCopy(u: BusinessUnderstanding, brief: CreativeBrief, deps: CopyWriterDeps = {}): Promise<StorefrontCopy> {
  const complete = deps.complete ?? ((request: AICompletionRequest) => getAIProvider().complete(request));
  try {
    const raw = await complete({ text: buildPrompt(u, brief), maxTokens: 900 });
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const parsed = copySchema.parse(JSON.parse(raw.slice(jsonStart, jsonEnd + 1)));
      return copySchema.parse(Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, sanitizeClaims(v as string)])));
    }
  } catch {
    // fall through to the floor
  }
  return proceduralCopy(u, brief);
}
