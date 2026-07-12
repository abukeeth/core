import { getAIProvider } from "../../lib/ai";
import { sanitizeClaims } from "./claims-filter";
import { contentCoreSchema, toneAdaptedCopySchema, type BrandProfile, type ContentCore, type IngestData, type StyleFamilyValue, type ToneAdaptedCopy } from "./types";

const CONTENT_SHAPE = `Return ONLY a JSON object (no prose, no markdown fences) matching this shape:

{
  "tagline": "string, <=8 words",
  "heroHeadline": "string, <=10 words",
  "heroSubhead": "string, one sentence",
  "aboutStory": "string, 150-300 words telling the restaurant's story",
  "signatureDishesIntro": "string, one sentence introducing standout dishes",
  "galleryIntro": "string, one sentence introducing the photo gallery",
  "ctaLabel": "string, a short call-to-action label (this may be overridden downstream)"
}

Never state a specific address, phone number, hours, or price — write prose *around* those facts,
they are shown separately from structured data. Never invent testimonials, awards, or reviews.
Never make superlative or health claims ("best in the world", "healthiest"). If the restaurant's
own story/history isn't given, write a generic but warm placeholder rather than inventing history.`;

function buildContentCorePrompt(input: IngestData, brandProfile: BrandProfile): string {
  const menuLines = input.menu.slice(0, 20).map((item) => `- ${item.name}${item.description ? `: ${item.description}` : ""}`).join("\n");

  return `You are writing the shared content core for ${input.restaurantName}'s new website, generated once
and reused (with light tone adaptation) across three design variations.

Cuisine: ${brandProfile.cuisine}
Business type: ${brandProfile.businessType}
Brand tone: ${brandProfile.personality.casualFormal >= 0.5 ? "formal" : "casual"}, ${
    brandProfile.personality.understatedBold >= 0.5 ? "bold" : "understated"
  }
${input.description ? `Owner-provided description: ${input.description}\n` : ""}
Menu highlights:
${menuLines || "(no menu items provided)"}

${CONTENT_SHAPE}`;
}

function buildToneAdaptationPrompt(core: ContentCore, family: StyleFamilyValue, input: IngestData): string {
  const toneGuide: Record<StyleFamilyValue, string> = {
    LUXURY: "refined, formal, understated — e.g. 'Reserve a table', full sentences, no exclamation points",
    MODERN: "energetic, bold, friendly — e.g. 'Order now', short punchy sentences, may use light enthusiasm",
    MINIMAL: "concise, restrained — shortest possible phrasing, menu-first framing",
  };

  return `Rewrite ONLY the voice-sensitive fields of this shared content core to match the ${family} style family
for ${input.restaurantName}. Tone guide: ${toneGuide[family]}.

Current content core:
${JSON.stringify(core, null, 2)}

Keep every fact identical (this restaurant's name, cuisine, and any menu references) — only change
voice/wording. ${CONTENT_SHAPE}`;
}

async function callAndParseText(prompt: string): Promise<string | null> {
  const text = await getAIProvider().complete({ text: prompt, maxTokens: 2048 });
  return text || null;
}

function sanitizeContentCore<T extends ContentCore>(core: T): T {
  return Object.fromEntries(Object.entries(core).map(([key, value]) => [key, sanitizeClaims(value)])) as T;
}

function fallbackContentCore(input: IngestData): ContentCore {
  return {
    tagline: `${input.restaurantName} — great food, done right`,
    heroHeadline: input.restaurantName,
    heroSubhead: input.description ?? "Welcome — take a look at what we're serving.",
    aboutStory: "[add your story]",
    signatureDishesIntro: "A few of our favorites.",
    galleryIntro: "A look inside.",
    ctaLabel: "View Menu",
  };
}

/**
 * Content generation stage 1: the shared content core (§2 stage 4), run
 * once per generation batch regardless of how many variations follow.
 * Falls back to templated copy on any failure so the site always
 * generates (§2 Guardrails) — never blocks the pipeline.
 */
export async function generateContentCore(input: IngestData, brandProfile: BrandProfile): Promise<ContentCore> {
  try {
    const text = await callAndParseText(buildContentCorePrompt(input, brandProfile));
    if (!text) return fallbackContentCore(input);

    const parsed: unknown = JSON.parse(text);
    const result = contentCoreSchema.safeParse(parsed);
    if (!result.success) return fallbackContentCore(input);

    return sanitizeContentCore(result.data);
  } catch {
    return fallbackContentCore(input);
  }
}

/**
 * Content generation stage 2: a lightweight per-variation tone-adaptation
 * pass (§2 stage 4) — only this call runs per style family, not the
 * expensive content-core generation, keeping the 3x-variation cost down
 * (§2 cost guardrail: target <=1.6x a single-site generation).
 */
export async function adaptToneForVariation(
  core: ContentCore,
  family: StyleFamilyValue,
  input: IngestData,
): Promise<ToneAdaptedCopy> {
  try {
    const text = await callAndParseText(buildToneAdaptationPrompt(core, family, input));
    if (!text) return core;

    const parsed: unknown = JSON.parse(text);
    const result = toneAdaptedCopySchema.safeParse(parsed);
    if (!result.success) return core;

    return sanitizeContentCore(result.data);
  } catch {
    return core;
  }
}
