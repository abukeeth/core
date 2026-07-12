import { safeFetch } from "../../../../lib/safe-fetch";

const SHORT_LINK_PATTERN = /^https?:\/\/maps\.app\.goo\.gl\//i;
const CHIJ_PATTERN = /ChIJ[A-Za-z0-9_-]+/;

function extractFromUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    const queryPlaceId = parsed.searchParams.get("place_id") ?? parsed.searchParams.get("query_place_id");
    if (queryPlaceId) return queryPlaceId;
  } catch {
    // Not a valid absolute URL; fall through to the regex match below.
  }

  return url.match(CHIJ_PATTERN)?.[0];
}

/**
 * Resolves a Google Place ID from either a raw Place ID or a Google Maps
 * URL. Handles the common cases (a direct Place ID, a URL with
 * place_id/query_place_id in its query string, a URL with a ChIJ-style
 * ID embedded anywhere in it, and maps.app.goo.gl short links via
 * redirect resolution). Google's URL formats aren't a stable public
 * contract, so a URL that doesn't match one of these shapes will fail
 * here — pass the Place ID directly in that case. Isolated in this one
 * function specifically so it's cheap to harden as formats drift.
 */
export async function resolvePlaceId(input: string): Promise<string> {
  const trimmed = input.trim();

  if (!/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  let resolvedUrl = trimmed;
  if (SHORT_LINK_PATTERN.test(trimmed)) {
    const result = await safeFetch(trimmed);
    resolvedUrl = result.finalUrl;
  }

  const placeId = extractFromUrl(resolvedUrl);
  if (!placeId) {
    throw new Error(`Could not determine a Google Place ID from: ${input}`);
  }
  return placeId;
}
