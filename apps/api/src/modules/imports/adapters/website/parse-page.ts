import * as cheerio from "cheerio";
import type { CandidateImage } from "./rank-menu-images";

export interface ParsedPage {
  text: string;
  images: CandidateImage[];
}

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

function parseDimension(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Extracts readable text and every on-page <img> (resolved to an
 * absolute URL, with its alt text, nearest preceding heading, and
 * declared dimensions) from fetched HTML. Heading/image association is
 * computed by walking the document in order, not by DOM proximity
 * within a single parent, so an image several containers deep under a
 * "Menu" heading is still associated with it.
 */
export function parsePage(html: string, baseUrl: string): ParsedPage {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();

  const text = $("body").text().replace(/\s+/g, " ").trim();

  const images: CandidateImage[] = [];
  let currentHeading: string | undefined;

  $("body")
    .find("*")
    .each((_index, el) => {
      const tagName = el.tagName?.toLowerCase();
      if (!tagName) return;

      if (HEADING_TAGS.has(tagName)) {
        const headingText = $(el).text().trim();
        if (headingText) currentHeading = headingText;
        return;
      }

      if (tagName === "img") {
        const src = $(el).attr("src");
        if (!src) return;

        let absoluteSrc: string;
        try {
          absoluteSrc = new URL(src, baseUrl).href;
        } catch {
          return;
        }

        images.push({
          src: absoluteSrc,
          alt: $(el).attr("alt"),
          nearbyHeading: currentHeading,
          width: parseDimension($(el).attr("width")),
          height: parseDimension($(el).attr("height")),
        });
      }
    });

  return { text, images };
}
