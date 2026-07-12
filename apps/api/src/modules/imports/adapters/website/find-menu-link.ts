import * as cheerio from "cheerio";

const MENU_LINK_KEYWORDS = ["menu", "food", "order"];

interface MenuLinkCandidate {
  href: string;
  score: number;
}

function normalizeForComparison(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return url;
  }
}

/**
 * Finds the best candidate for a separate "menu" page linked from the
 * current page (e.g. a nav link to /menu) — the Website adapter follows
 * this as exactly one bounded extra hop, not general crawling. Scores
 * (does not filter) every on-page link by menu-related keywords in its
 * text and href; returns the top-scoring absolute URL, or null when
 * nothing scores positively or the only candidate is the page itself.
 */
export function findMenuLink(html: string, baseUrl: string): string | null {
  const $ = cheerio.load(html);
  const normalizedBase = normalizeForComparison(baseUrl);
  const candidates: MenuLinkCandidate[] = [];

  $("a[href]").each((_index, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    let absoluteHref: string;
    try {
      absoluteHref = new URL(href, baseUrl).href;
    } catch {
      return;
    }
    if (normalizeForComparison(absoluteHref) === normalizedBase) return;

    const text = $(el).text().trim().toLowerCase();
    const hrefLower = href.toLowerCase();

    let score = 0;
    for (const keyword of MENU_LINK_KEYWORDS) {
      if (text === keyword) score += 4;
      else if (text.includes(keyword)) score += 2;
      if (hrefLower.includes(keyword)) score += 2;
    }
    if (score > 0) {
      candidates.push({ href: absoluteHref, score });
    }
  });

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]!.href;
}
