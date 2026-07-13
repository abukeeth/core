/**
 * Fallback storefront origin used only when no real site/domain value is
 * available yet from the API (no Site row created yet, or a temporarily
 * missing temporaryDomain) — mirrors apps/api's FRONTEND_URL-based canonical
 * host (see site.service.ts's temporaryStorefrontUrl) so every screen's
 * illustrative "your site will look like this" text stays consistent and
 * there's exactly one place to update if the canonical host ever changes.
 *
 * Sanitized the same way the backend is: a misconfigured NEXT_PUBLIC_SITE_URL
 * (trailing slash, or a known-bad placeholder value that leaked into an env
 * var and was never corrected) must never produce a double slash or a
 * dead-end domain in a customer-facing link.
 */
const KNOWN_BAD_DOMAIN_FRAGMENTS = ["placeholder.example", "sites.ordervora.example", ".vercel.app", ".onrender.com"];

function isKnownBadHost(hostOrUrl: string): boolean {
  return KNOWN_BAD_DOMAIN_FRAGMENTS.some((bad) => hostOrUrl.toLowerCase().includes(bad));
}

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, "");
}

function safeCanonicalOrigin(): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  const trimmed = stripTrailingSlashes(configured);
  if (!trimmed || isKnownBadHost(trimmed)) {
    return "https://www.ordervora.com";
  }
  return trimmed;
}

export const CANONICAL_SITE_ORIGIN = safeCanonicalOrigin();

export function fallbackStorefrontUrl(slug: string): string {
  return `${CANONICAL_SITE_ORIGIN}/store/${slug}`;
}
