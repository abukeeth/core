/**
 * Presentation-layer only. Produces a premium, business-specific name for each
 * generated storefront — e.g. "Easy Tobacco Prestige", "Qahwah Palace Reserve".
 *
 * The internal theme / style family is NEVER used here and NEVER shown. Naming
 * is driven purely by the business name and the storefront's display rank
 * (index 0 = the recommended, most dominant storefront). Pure, deterministic,
 * no AI, no network, no generation stage — zero cost, zero latency.
 *
 * Hard rule (enforced by storefront-concepts.test.ts): the tier words and
 * descriptions never contain theme/template vocabulary — Theme, Template,
 * Variation, Modern, Luxury, Local, Style Family — or the word "AI".
 */

export interface StorefrontConcept {
  name: string;
  description: string;
}

/** Trim generic trailing words so the premium tier reads cleanly after the name. */
const GENERIC_SUFFIX = /\s+(shops?|stores?|cafe|café|coffee|deli|restaurant|bakery|market|llc|inc|co)\.?$/i;

function shortName(businessName: string | null | undefined): string {
  const raw = (businessName ?? "").trim();
  if (!raw) return "Your Store";
  const trimmed = raw.replace(GENERIC_SUFFIX, "").trim();
  return trimmed.length >= 2 ? trimmed : raw;
}

/** The recommended storefront leads with the strongest tier; the middle tier
 * is chosen deterministically per business so names feel bespoke, not templated. */
const MIDDLE_TIERS = ["Prime", "Reserve", "Elite", "Select"] as const;

const DESCRIPTIONS = [
  "A bold, premium storefront that puts your best offerings front and center.",
  "A refined, editorial storefront that tells your brand's story.",
  "A warm, welcoming storefront built for everyday visits.",
];

function hash(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Resolve the customer-facing storefront concept for one generated option.
 * `index` is the display rank: 0 = recommended (largest, first).
 */
export function storefrontConcept(businessName: string | null | undefined, index = 0): StorefrontConcept {
  const base = shortName(businessName);
  const middle = MIDDLE_TIERS[hash(base) % MIDDLE_TIERS.length];
  const tier = index <= 0 ? "Prestige" : index === 1 ? middle : "Signature";
  const description = DESCRIPTIONS[Math.min(Math.max(index, 0), DESCRIPTIONS.length - 1)];
  return { name: `${base} ${tier}`, description };
}

/** The static, non-business parts of every concept — used by the guardrail test. */
export function conceptVocabulary(): string[] {
  return ["Prestige", "Signature", ...MIDDLE_TIERS, ...DESCRIPTIONS];
}
