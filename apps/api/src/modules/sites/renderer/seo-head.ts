import { escapeHtml, safeJsonLd } from "./html-escape";
import type { JsonLdInput } from "./json-ld";
import { buildBreadcrumbJsonLd, buildRestaurantJsonLd } from "./json-ld";
import type { SitePage } from "../types";

export interface SeoHeadInput extends JsonLdInput {
  page: SitePage;
  noindex?: boolean;
  faviconUrl?: string;
}

/**
 * §9 SEO Generation + §10 Open Graph — every public page gets a real
 * title/meta description/canonical, OG + Twitter card tags with a
 * generated share image, and JSON-LD (Restaurant + BreadcrumbList),
 * inlined as an escaped <script type="application/ld+json"> (§27: no raw
 * HTML from any owner-editable/LLM-generated field).
 */
export function renderSeoHead(input: SeoHeadInput): string {
  const canonical = `${input.siteUrl}${input.page.slug === "/" ? "" : input.page.slug}`;
  const ogImageUrl = `${input.siteUrl}/og-image.svg`;
  const restaurantJsonLd = buildRestaurantJsonLd(input);
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(input);

  const robotsTag = input.noindex ? `<meta name="robots" content="noindex, nofollow" />` : "";
  const faviconTag = input.faviconUrl ? `<link rel="icon" href="${escapeHtml(input.faviconUrl)}" />` : "";

  return `<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(input.page.title)}</title>
<meta name="description" content="${escapeHtml(input.page.metaDescription)}" />
<link rel="canonical" href="${escapeHtml(canonical)}" />
${faviconTag}
${robotsTag}
<meta property="og:title" content="${escapeHtml(input.page.title)}" />
<meta property="og:description" content="${escapeHtml(input.page.metaDescription)}" />
<meta property="og:type" content="restaurant.restaurant" />
<meta property="og:url" content="${escapeHtml(canonical)}" />
<meta property="og:image" content="${escapeHtml(ogImageUrl)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(input.page.title)}" />
<meta name="twitter:description" content="${escapeHtml(input.page.metaDescription)}" />
<meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />
<script type="application/ld+json">${safeJsonLd(restaurantJsonLd)}</script>
<script type="application/ld+json">${safeJsonLd(breadcrumbJsonLd)}</script>`;
}
