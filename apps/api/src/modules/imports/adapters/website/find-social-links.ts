import * as cheerio from "cheerio";

export interface SocialLink {
  platform: string;
  url: string;
}

const SOCIAL_DOMAINS: { platform: string; hostnames: string[] }[] = [
  { platform: "facebook", hostnames: ["facebook.com", "fb.com"] },
  { platform: "instagram", hostnames: ["instagram.com"] },
  { platform: "twitter", hostnames: ["twitter.com", "x.com"] },
  { platform: "tiktok", hostnames: ["tiktok.com"] },
  { platform: "yelp", hostnames: ["yelp.com"] },
];

/**
 * Scans every on-page link for known social-platform domains — this is
 * effectively free when we're already fetching the page for menu/text
 * extraction, no extra network call needed. Keeps the first URL seen per
 * platform (page order); a page linking the same platform twice (e.g. a
 * header icon and a footer icon) doesn't produce a duplicate entry.
 */
export function findSocialLinks(html: string, baseUrl: string): SocialLink[] {
  const $ = cheerio.load(html);
  const seen = new Map<string, string>();

  $("a[href]").each((_index, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    let absoluteHref: string;
    let hostname: string;
    try {
      const parsed = new URL(href, baseUrl);
      absoluteHref = parsed.href;
      hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return;
    }

    for (const { platform, hostnames } of SOCIAL_DOMAINS) {
      if (hostnames.includes(hostname) && !seen.has(platform)) {
        seen.set(platform, absoluteHref);
      }
    }
  });

  return [...seen.entries()].map(([platform, url]) => ({ platform, url }));
}
