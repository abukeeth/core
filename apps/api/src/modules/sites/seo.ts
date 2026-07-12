const MAX_TITLE_LENGTH = 70;
const MAX_META_DESCRIPTION_LENGTH = 155;

/**
 * Best-effort city extraction from a free-form address string (§9 title
 * pattern needs "{City}"). We only have a single address field, not
 * structured components, so this is a heuristic — documented as such —
 * rather than a guarantee; SEO fields degrade gracefully without a city.
 */
export function guessCityFromAddress(address: string | undefined): string | undefined {
  if (!address) return undefined;
  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return undefined;
  return parts[parts.length - 2] || undefined;
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

/** §9 title pattern: `{Page} — {Restaurant} | {Cuisine} in {City}`. */
export function buildPageTitle(page: string, restaurantName: string, cuisine: string, city?: string): string {
  const suffix = city ? `${cuisine} in ${city}` : cuisine;
  return truncate(`${page} — ${restaurantName} | ${suffix}`, MAX_TITLE_LENGTH);
}

export function buildMetaDescription(base: string, cuisine: string, city?: string): string {
  const suffix = city ? `${cuisine} in ${city}.` : `${cuisine} cuisine.`;
  return truncate(`${base} ${suffix}`, MAX_META_DESCRIPTION_LENGTH);
}
