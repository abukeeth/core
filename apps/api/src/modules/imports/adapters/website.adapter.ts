import { ImportSourceType } from "@prisma/client";
import type { AIMediaType } from "../../../lib/ai";
import { getNumberEnv } from "../../../config/env";
import { safeFetch } from "../../../lib/safe-fetch";
import { mergeExtractedMenuData } from "../merge-extracted-data";
import type { ExtractedMenuData, ImportAdapter, ImportSourceInput } from "../types";
import { extractMenuFromImages, extractMenuFromText } from "../vision-extractor";
import { findMenuLink } from "./website/find-menu-link";
import { findSocialLinks, type SocialLink } from "./website/find-social-links";
import { parsePage } from "./website/parse-page";
import { rankMenuImages } from "./website/rank-menu-images";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const IMAGE_MIME_BY_EXTENSION: Record<string, AIMediaType> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function guessMediaType(url: string): AIMediaType | undefined {
  const path = new URL(url).pathname.toLowerCase();
  const extension = Object.keys(IMAGE_MIME_BY_EXTENSION).find((ext) => path.endsWith(ext));
  return extension ? IMAGE_MIME_BY_EXTENSION[extension] : undefined;
}

function maxWebsiteImages(): number {
  return getNumberEnv("IMPORT_WEBSITE_MAX_IMAGES", 5);
}

async function tryExtractText(text: string): Promise<ExtractedMenuData[]> {
  try {
    return [await extractMenuFromText(text)];
  } catch {
    // Text extraction failing shouldn't sink the whole import if any
    // images still succeed.
    return [];
  }
}

async function tryExtractImage(src: string): Promise<ExtractedMenuData[]> {
  const mediaType = guessMediaType(src);
  if (!mediaType) return [];

  try {
    const fetched = await safeFetch(src, { maxBytes: MAX_IMAGE_BYTES });
    return [await extractMenuFromImages([fetched.buffer], mediaType)];
  } catch {
    // A single bad image (fetch failure, disallowed host, unsupported
    // content, etc.) shouldn't fail the whole import — skip it.
    return [];
  }
}

async function extractFromOnePage(html: string, baseUrl: string): Promise<{ results: ExtractedMenuData[]; socialLinks: SocialLink[] }> {
  const { text, images } = parsePage(html, baseUrl);
  const rankedImages = rankMenuImages(images).slice(0, maxWebsiteImages());

  const results: ExtractedMenuData[] = [];
  if (text.length > 0) {
    results.push(...(await tryExtractText(text)));
  }
  for (const image of rankedImages) {
    results.push(...(await tryExtractImage(image.src)));
  }

  return { results, socialLinks: findSocialLinks(html, baseUrl) };
}

/**
 * The reusable core behind both WebsiteImportAdapter and the Google Maps
 * adapter's "if a website exists, automatically discover and crawl it"
 * behavior — one function, two callers, so the two never drift apart on
 * how a website gets turned into ExtractedMenuData.
 *
 * Fetches the given URL, then follows at most one additional discovered
 * "Menu" link (bounded crawl, not general recursive crawling, per the
 * cost/complexity trade-off already established for this adapter) —
 * catching real menu pages a site puts on a separate URL from the one
 * submitted. Following the menu link is itself best-effort: a failure to
 * fetch it doesn't sink the original page's own extraction result.
 */
export async function extractWebsiteData(url: string): Promise<ExtractedMenuData> {
  const page = await safeFetch(url);
  const html = page.buffer.toString("utf-8");
  const { results, socialLinks } = await extractFromOnePage(html, page.finalUrl);

  const menuLink = findMenuLink(html, page.finalUrl);
  if (menuLink) {
    try {
      const menuPage = await safeFetch(menuLink);
      const menuHtml = menuPage.buffer.toString("utf-8");
      const menuPageResult = await extractFromOnePage(menuHtml, menuPage.finalUrl);
      results.push(...menuPageResult.results);
      socialLinks.push(...menuPageResult.socialLinks);
    } catch {
      // Following the discovered menu link is best-effort — the original
      // page's own extraction result still stands if this fails.
    }
  }

  if (socialLinks.length > 0) {
    results.push({ categories: [], businessProfile: { socialLinks } });
  }

  return mergeExtractedMenuData(results);
}

export class WebsiteImportAdapter implements ImportAdapter {
  readonly sourceType = ImportSourceType.WEBSITE;
  readonly implemented = true;
  readonly inputKind = "url" as const;

  async extract(input: ImportSourceInput): Promise<ExtractedMenuData> {
    if (input.kind !== "url") {
      throw new Error("Website import requires a source URL");
    }

    return extractWebsiteData(input.url);
  }
}
