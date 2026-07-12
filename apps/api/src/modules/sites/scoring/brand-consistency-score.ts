import { getAIProvider } from "../../../lib/ai";
import { z } from "zod";
import type { BrandProfile, DimensionScore, SiteDefinition, Suggestion, ThemeCatalogEntry } from "../types";

const judgeResponseSchema = z.object({
  alignmentScore: z.number().min(0).max(100),
  issue: z.string().optional(),
});

const RESPONSE_SHAPE = `Return ONLY a JSON object (no prose, no markdown fences) matching this shape:
{ "alignmentScore": "number 0-100 (100 = copy tone perfectly matches the brand profile)", "issue": "string (optional, only if alignmentScore < 80)" }`;

function buildPrompt(definition: SiteDefinition, brandProfile: BrandProfile): string {
  const home = definition.pages.find((page) => page.slug === "/");
  const hero = home?.sections.find((section) => section.type === "hero");
  const about = definition.pages.find((page) => page.slug === "/about")?.sections.find((s) => s.type === "aboutStory");

  return `Judge whether this website copy's tone matches the restaurant's Brand Profile.

Brand Profile: cuisine=${brandProfile.cuisine}, businessType=${brandProfile.businessType}, tone=${
    brandProfile.personality.casualFormal >= 0.5 ? "formal" : "casual"
  }/${brandProfile.personality.understatedBold >= 0.5 ? "bold" : "understated"}

Tagline: ${definition.tagline}
Hero headline: ${hero?.props.headline ?? ""}
Hero subhead: ${hero?.props.subhead ?? ""}
About story: ${about?.props.story ?? ""}

${RESPONSE_SHAPE}`;
}

/** LLM judge half of the hybrid score — never throws; a neutral score on failure keeps the pipeline moving. */
async function judgeBrandConsistency(definition: SiteDefinition, brandProfile: BrandProfile): Promise<{ alignmentScore: number; issue?: string }> {
  try {
    const text = await getAIProvider().complete({ text: buildPrompt(definition, brandProfile), maxTokens: 512 });
    if (!text) return { alignmentScore: 80 };

    const parsed: unknown = JSON.parse(text);
    const result = judgeResponseSchema.safeParse(parsed);
    return result.success ? result.data : { alignmentScore: 80 };
  } catch {
    return { alignmentScore: 80 };
  }
}

/**
 * Brand Consistency score (§2c row 4) — hybrid: deterministic palette/font
 * checks (a site can only be off-brand here if it was manually edited away
 * from the theme's own tokens, e.g. via the Design tab) plus an LLM judge
 * that only evaluates copy tone against the *stored* Brand Profile — it
 * never invents what the brand "should" be, only whether the copy matches
 * what was already decided.
 */
export async function scoreBrandConsistency(
  definition: SiteDefinition,
  brandProfile: BrandProfile,
  theme: ThemeCatalogEntry,
): Promise<DimensionScore> {
  let score = 100;
  const suggestions: Suggestion[] = [];

  const fontMismatch =
    definition.typography.display !== theme.tokens.typography.display || definition.typography.body !== theme.tokens.typography.body;
  if (fontMismatch) {
    score -= 10;
    suggestions.push({
      id: "brandConsistency:font-pairing",
      dimension: "brandConsistency",
      issue: "Typography no longer matches the selected theme's curated font pairing",
      impact: "low",
      suggestion: "Revert to the theme's curated font pairing, or pick another curated pairing from the Design tab.",
    });
  }

  const { alignmentScore, issue } = await judgeBrandConsistency(definition, brandProfile);
  if (alignmentScore < 80) {
    score -= Math.round((80 - alignmentScore) / 2);
    suggestions.push({
      id: "brandConsistency:tone-alignment",
      dimension: "brandConsistency",
      issue: issue ?? "Copy tone doesn't fully match the brand profile",
      impact: alignmentScore < 50 ? "high" : "medium",
      suggestion: "Regenerate the affected section's copy, or adjust the Brand Profile sliders to better match your intent.",
    });
  }

  return { dimension: "brandConsistency", score: Math.max(0, Math.round(score)), suggestions };
}
