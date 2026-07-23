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

/**
 * §9 title pattern: `{Page} — {Restaurant} | {Cuisine} in {City}`.
 * `cuisine` is omitted when undefined (e.g. a low-confidence safe-default guess
 * the caller chose not to surface) so a generic placeholder like "eclectic"
 * never reaches the customer — the title degrades to `{Page} — {Restaurant}`
 * (optionally with the city) instead.
 */
export function buildPageTitle(page: string, restaurantName: string, cuisine: string | undefined, city?: string): string {
  const descriptor = cuisine ? (city ? `${cuisine} in ${city}` : cuisine) : city;
  return truncate(descriptor ? `${page} — ${restaurantName} | ${descriptor}` : `${page} — ${restaurantName}`, MAX_TITLE_LENGTH);
}

export function buildMetaDescription(base: string, cuisine: string | undefined, city?: string): string {
  const suffix = cuisine ? (city ? `${cuisine} in ${city}.` : `${cuisine} cuisine.`) : city ? `In ${city}.` : "";
  return truncate(suffix ? `${base} ${suffix}` : base, MAX_META_DESCRIPTION_LENGTH);
}
