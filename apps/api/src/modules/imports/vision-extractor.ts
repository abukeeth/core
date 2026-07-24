import { getAIProvider, type AIMediaType } from "../../lib/ai";
import { extractedMenuDataSchema, type ExtractedMenuData } from "./types";

const RESPONSE_SHAPE = `Return ONLY a JSON object (no prose, no markdown fences) matching this shape:

{
  "categories": [
    {
      "name": "string",
      "items": [
        { "name": "string", "description": "string (optional)", "priceCents": integer }
      ]
    }
  ],
  "businessProfile": {
    "name": "string (optional, the business's name if visible)",
    "address": "string (optional)",
    "phone": "string (optional)"
  }
}

Prices must be integer cents (e.g. $12.50 -> 1250). If a price is unclear, make your best estimate.
Group items under the categories shown; if none are visible, use a single "Menu" category.
Only include "businessProfile" fields you can actually confirm; omit fields you can't find, and omit
"businessProfile" entirely if none of it is visible.`;

const IMAGE_INTRO = "You are extracting a restaurant menu from the attached image(s).";
const TEXT_INTRO = "You are extracting a restaurant menu from the following webpage text content.";

/**
 * Recover the JSON object from a model response before parsing. Despite the
 * "return ONLY a JSON object, no markdown fences" instruction, models
 * routinely wrap the payload in a ```json fence or a sentence of preamble
 * ("Here is the extracted menu:"). A raw JSON.parse on that throws and fails
 * the whole import, so strip a surrounding code fence and, as a fallback,
 * slice the outermost { … } span. Returns the trimmed input unchanged when no
 * object span is present, so JSON.parse still surfaces a clear error.
 */
export function extractJsonObjectText(raw: string): string {
  const withoutFences = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const first = withoutFences.indexOf("{");
  const last = withoutFences.lastIndexOf("}");
  if (first === -1 || last <= first) return withoutFences;
  return withoutFences.slice(first, last + 1);
}

/**
 * Shared call + response-parsing core for every extraction path (image
 * or text), so they never drift out of sync on validation behavior.
 */
async function callAndParse(text: string, images?: { data: Buffer; mediaType: AIMediaType }[]): Promise<ExtractedMenuData> {
  const responseText = await getAIProvider().complete({ text, images, maxTokens: 4096 });
  if (!responseText) {
    throw new Error("AI response contained no text content");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJsonObjectText(responseText));
  } catch {
    throw new Error("AI response was not valid JSON");
  }
  return extractedMenuDataSchema.parse(parsed);
}

/**
 * Shared extraction core used by the PDF adapter (which renders pages to
 * images first), the Image adapter (which passes the uploaded image
 * straight through), and the Website adapter (for any candidate menu
 * images found on the page).
 */
export async function extractMenuFromImages(images: Buffer[], mediaType: AIMediaType): Promise<ExtractedMenuData> {
  return callAndParse(
    `${IMAGE_INTRO}\n\n${RESPONSE_SHAPE}`,
    images.map((data) => ({ data, mediaType })),
  );
}

/**
 * Like extractMenuFromImages but for a mixed set of images that don't all
 * share one media type (e.g. a consolidated onboarding upload of JPEGs +
 * PNGs analyzed together in a single vision call). One call keeps cost/latency
 * bounded vs. one call per image.
 */
export async function extractMenuFromImageParts(parts: { data: Buffer; mediaType: AIMediaType }[]): Promise<ExtractedMenuData> {
  return callAndParse(`${IMAGE_INTRO}\n\n${RESPONSE_SHAPE}`, parts);
}

/**
 * Text counterpart to extractMenuFromImages, used by the Website adapter
 * for a page's readable text content. Shares the same prompt shape and
 * validation via `callAndParse`.
 */
export async function extractMenuFromText(text: string): Promise<ExtractedMenuData> {
  return callAndParse(`${TEXT_INTRO}\n\n${RESPONSE_SHAPE}\n\nWebpage content:\n${text}`);
}
