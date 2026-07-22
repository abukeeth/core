import { z } from "zod";
import { getAIProvider } from "../../../lib/ai";
import type { AICompletionRequest } from "../../../lib/ai";
import type { BrandProfile, IngestData } from "../types";
import type { BrandKit, VerticalProfile } from "./brand-kit";
import { ensureReadablePalette } from "./palette-validator";
import { getVerticalProfile, resolveVertical } from "./vertical-profiles";

/**
 * Sprint 5.5 — the AI Brand Generator.
 *
 * Produces a Brand Kit (the per-business identity: palette, vocabulary, tone,
 * tagline, story, art-direction). When AI is available it enriches a
 * deterministic vertical fallback; otherwise (or on any failure) it returns the
 * fallback unchanged. Either way the palette is run through WCAG validation, so
 * the storefront's color is always readable. No image generation and no pipeline
 * wiring here — this is a pure, unit-tested building block.
 */

export interface GenerateBrandKitInput {
  ingest: IngestData;
  brandProfile: BrandProfile;
  /** The enum vertical (e.g. "VAPE_SHOP"); inferred from the brand profile when absent. */
  vertical?: string;
}

export interface GenerateBrandKitDeps {
  /** Injectable text completion — defaults to the configured AI provider. */
  complete?: (request: AICompletionRequest) => Promise<string>;
}

const hex = z.string().regex(/^#?[0-9a-fA-F]{6}$/);
const aiBrandSchema = z
  .object({
    palette: z
      .object({ primary: hex, secondary: hex.optional(), accent: hex, background: hex, text: hex })
      .partial()
      .optional(),
    vocabulary: z
      .object({
        catalogNoun: z.string().min(1),
        itemNoun: z.string().min(1),
        itemPlural: z.string().min(1),
        categoryUnitSingular: z.string().min(1),
        categoryUnitPlural: z.string().min(1),
        primaryCta: z.string().min(1),
        exploreLabel: z.string().min(1),
      })
      .optional(),
    tone: z.object({ voice: z.string().min(1), adjectives: z.array(z.string().min(1)).min(1) }).optional(),
    tagline: z.string().min(1).max(140).optional(),
    brandStory: z.string().min(1).max(600).optional(),
  })
  .partial();

type AiBrand = z.infer<typeof aiBrandSchema>;

function buildFallbackKit(ingest: IngestData, profile: VerticalProfile, vertical: string): BrandKit {
  const description = ingest.description?.trim();
  return {
    vertical,
    palette: ensureReadablePalette(profile.palette),
    vocabulary: profile.vocabulary,
    tone: profile.tone,
    tagline: `${ingest.restaurantName} — ${profile.taglineSuffix}`,
    brandStory: description && description.length > 0 ? description : profile.brandStoryDefault.replace("{name}", ingest.restaurantName),
    artDirection: profile.artDirection,
    source: "fallback",
  };
}

function buildPrompt(ingest: IngestData, brandProfile: BrandProfile, profile: VerticalProfile): string {
  const categories = [...new Set(ingest.menu.map((m) => m.categoryName))].slice(0, 12).join(", ");
  return [
    `You are a brand designer. Design a distinctive brand identity for this ${profile.vertical} business.`,
    `Business: ${ingest.restaurantName}`,
    ingest.description ? `Description: ${ingest.description}` : "",
    `Menu categories: ${categories || "n/a"}`,
    `Personality signals: ${brandProfile.businessType}`,
    "",
    "Return ONLY a JSON object with these optional keys: palette {primary,accent,background,text} as #RRGGBB;",
    `vocabulary {catalogNoun,itemNoun,itemPlural,categoryUnitSingular,categoryUnitPlural,primaryCta,exploreLabel} appropriate to a ${profile.vertical};`,
    "tone {voice, adjectives[]}; tagline (<=140 chars, grounded in the real business, not generic 'great food'); brandStory (<=600 chars, only real facts).",
    "The palette must be legible (readable text on background). Do not invent product claims.",
  ]
    .filter(Boolean)
    .join("\n");
}

function extractJson(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

function parseAiBrand(raw: string): AiBrand | null {
  const json = extractJson(raw);
  if (json === undefined) return null;
  const result = aiBrandSchema.safeParse(json);
  return result.success ? result.data : null;
}

function normalizeHex(value: string): string {
  return value.startsWith("#") ? value.toUpperCase() : `#${value.toUpperCase()}`;
}

function assembleFromAi(ai: AiBrand, fallback: BrandKit, profile: VerticalProfile): BrandKit {
  // Palette: AI proposes, but every color is validated/repaired against the
  // profile palette as the fallback — an unreadable AI palette can never ship.
  const proposedPalette = {
    primary: ai.palette?.primary ? normalizeHex(ai.palette.primary) : profile.palette.primary,
    secondary: ai.palette?.secondary ? normalizeHex(ai.palette.secondary) : profile.palette.secondary,
    accent: ai.palette?.accent ? normalizeHex(ai.palette.accent) : profile.palette.accent,
    background: ai.palette?.background ? normalizeHex(ai.palette.background) : profile.palette.background,
    text: ai.palette?.text ? normalizeHex(ai.palette.text) : profile.palette.text,
  };

  return {
    vertical: fallback.vertical,
    palette: ensureReadablePalette(proposedPalette, profile.palette),
    vocabulary: ai.vocabulary ?? fallback.vocabulary,
    tone: ai.tone ?? fallback.tone,
    tagline: ai.tagline?.trim() || fallback.tagline,
    brandStory: ai.brandStory?.trim() || fallback.brandStory,
    artDirection: fallback.artDirection,
    source: "ai",
  };
}

/**
 * Generate the Brand Kit. Deterministic fallback when AI is unavailable/failing;
 * AI-enriched (with palette validation) when it succeeds.
 */
export async function generateBrandKit(input: GenerateBrandKitInput, deps: GenerateBrandKitDeps = {}): Promise<BrandKit> {
  // Evidence from the business itself (name + imported menu categories) can
  // override a default-ish stored vertical — see resolveVertical. This is what
  // stops a deli that tapped "Restaurant" from getting fine-dining branding.
  const vertical = resolveVertical(input.vertical, input.brandProfile, {
    businessName: input.ingest.restaurantName,
    menuCategories: [...new Set((input.ingest.menu ?? []).map((item) => item.categoryName))],
  });
  const profile = getVerticalProfile(vertical);
  const fallback = buildFallbackKit(input.ingest, profile, vertical);

  try {
    const complete = deps.complete ?? ((request: AICompletionRequest) => getAIProvider().complete(request));
    const raw = await complete({ text: buildPrompt(input.ingest, input.brandProfile, profile), maxTokens: 1200 });
    const ai = parseAiBrand(raw);
    if (!ai) return fallback;
    return assembleFromAi(ai, fallback, profile);
  } catch {
    return fallback;
  }
}
