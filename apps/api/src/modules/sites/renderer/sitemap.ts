import type { SitePage } from "../types";

/** §9 — XML sitemap auto-generated on publish. */
export function renderSitemapXml(siteUrl: string, pages: SitePage[]): string {
  const urls = pages
    .map((page) => `  <url><loc>${siteUrl}${page.slug === "/" ? "" : page.slug}</loc></url>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

/** §9 — robots.txt referencing the sitemap; preview URLs are noindex via header instead (they live under a different path entirely). */
export function renderRobotsTxt(siteUrl: string): string {
  return `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml`;
}
