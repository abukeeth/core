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
 * Shared call + response-parsing core for every extraction path (image
 * or text), so they never drift out of sync on validation behavior.
 */
async function callAndParse(text: string, images?: { data: Buffer; mediaType: AIMediaType }[]): Promise<ExtractedMenuData> {
  const responseText = await getAIProvider().complete({ text, images, maxTokens: 4096 });
  if (!responseText) {
    throw new Error("AI response contained no text content");
  }

  const parsed: unknown = JSON.parse(responseText);
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
 * Text counterpart to extractMenuFromImages, used by the Website adapter
 * for a page's readable text content. Shares the same prompt shape and
 * validation via `callAndParse`.
 */
export async function extractMenuFromText(text: string): Promise<ExtractedMenuData> {
  return callAndParse(`${TEXT_INTRO}\n\n${RESPONSE_SHAPE}\n\nWebpage content:\n${text}`);
}
