/**
 * Fallback storefront origin used only when no real site/domain value is
 * available yet from the API (no Site row created yet, or a temporarily
 * missing temporaryDomain) — mirrors apps/api's FRONTEND_URL-based canonical
 * host (see site.service.ts's temporaryStorefrontUrl) so every screen's
 * illustrative "your site will look like this" text stays consistent and
 * there's exactly one place to update if the canonical host ever changes.
 */
export const CANONICAL_SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ordervora.com";

export function fallbackStorefrontUrl(slug: string): string {
  return `${CANONICAL_SITE_ORIGIN}/store/${slug}`;
}
