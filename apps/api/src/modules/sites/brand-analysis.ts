import { getAIProvider } from "../../lib/ai";
import { brandProfileSchema, type BrandPersonality, type BrandProfile, type IngestData } from "./types";

const CONFIDENCE_THRESHOLD = 0.5;

const SAFE_DEFAULT_PERSONALITY: BrandPersonality = {
  traditionalContemporary: 0.5,
  casualFormal: 0.5,
  playfulSerious: 0.5,
  understatedBold: 0.5,
  rusticPolished: 0.5,
};
const SAFE_DEFAULT_BUSINESS_TYPE = "casual dining";
const SAFE_DEFAULT_PRICE_TIER = 2;
const SAFE_DEFAULT_CUISINE = "eclectic";

const RESPONSE_SHAPE = `Return ONLY a JSON object (no prose, no markdown fences) matching this shape:

{
  "cuisine": "string (a single cuisine taxonomy value, e.g. 'italian', 'mexican', 'japanese')",
  "businessType": "string (e.g. 'fine dining', 'bistro', 'cafe', 'fast casual', 'bar', 'food truck', 'bakery')",
  "priceTier": "integer 1-4 (1=budget, 4=upscale), inferred from menu prices",
  "personality": {
    "traditionalContemporary": "number 0-1 (0=traditional, 1=contemporary)",
    "casualFormal": "number 0-1 (0=casual, 1=formal)",
    "playfulSerious": "number 0-1 (0=playful, 1=serious)",
    "understatedBold": "number 0-1 (0=understated, 1=bold)",
    "rusticPolished": "number 0-1 (0=rustic, 1=polished)"
  },
  "signalsUsed": ["string array naming which inputs drove your judgments, e.g. 'menu language', 'price points'"],
  "confidence": {
    "cuisine": "number 0-1",
    "businessType": "number 0-1",
    "priceTier": "number 0-1",
    "personality": "number 0-1"
  }
}

Base every judgment only on the restaurant data provided below. Do not invent facts not present in the input.`;

function buildPrompt(input: IngestData): string {
  const menuLines = input.menu
    .map((item) => `- [${item.categoryName}] ${item.name} — $${(item.priceCents / 100).toFixed(2)}${item.description ? `: ${item.description}` : ""}`)
    .join("\n");

  return `You are analyzing a restaurant's brand for an AI website generator.

Restaurant name: ${input.restaurantName}
${input.description ? `Description: ${input.description}\n` : ""}Number of photos available: ${input.photoCount}

Menu:
${menuLines || "(no menu items provided)"}

${RESPONSE_SHAPE}`;
}

function safeDefaultBrandProfile(): BrandProfile {
  return {
    cuisine: SAFE_DEFAULT_CUISINE,
    businessType: SAFE_DEFAULT_BUSINESS_TYPE,
    priceTier: SAFE_DEFAULT_PRICE_TIER,
    personality: SAFE_DEFAULT_PERSONALITY,
    signalsUsed: [],
    confidence: { cuisine: 0, businessType: 0, priceTier: 0, personality: 0 },
  };
}

/**
 * Low-confidence fields fall back to safe defaults rather than trusting a
 * weak guess (§2b) — the owner is shown these came from a guess via the
 * confidence values themselves, unchanged, so the UI can surface "we
 * guessed X — adjust?" without this function needing to know about the UI.
 */
function applyConfidenceThresholds(profile: BrandProfile): BrandProfile {
  return {
    ...profile,
    cuisine: profile.confidence.cuisine >= CONFIDENCE_THRESHOLD ? profile.cuisine : SAFE_DEFAULT_CUISINE,
    businessType: profile.confidence.businessType >= CONFIDENCE_THRESHOLD ? profile.businessType : SAFE_DEFAULT_BUSINESS_TYPE,
    priceTier: profile.confidence.priceTier >= CONFIDENCE_THRESHOLD ? profile.priceTier : SAFE_DEFAULT_PRICE_TIER,
    personality: profile.confidence.personality >= CONFIDENCE_THRESHOLD ? profile.personality : SAFE_DEFAULT_PERSONALITY,
  };
}

/**
 * Brand Analysis (§2 stage 2, §2b step 1). Runs once per generation batch.
 * Never throws — a failed call or a response that doesn't match the schema
 * falls back to a safe-default profile (confidence 0 on every field) so the
 * pipeline can still produce a site (§2 Guardrails: "site always generates").
 */
export async function analyzeBrand(input: IngestData): Promise<BrandProfile> {
  try {
    const text = await getAIProvider().complete({ text: buildPrompt(input), maxTokens: 1024 });
    if (!text) {
      return safeDefaultBrandProfile();
    }

    const parsed: unknown = JSON.parse(text);
    const result = brandProfileSchema.safeParse(parsed);
    if (!result.success) {
      return safeDefaultBrandProfile();
    }

    return applyConfidenceThresholds(result.data);
  } catch {
    return safeDefaultBrandProfile();
  }
}
