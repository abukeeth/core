import { describe, expect, it } from "vitest";
import { renderRobotsTxt, renderSitemapXml } from "./sitemap";
import type { SitePage } from "../types";

const pages: SitePage[] = [
  { slug: "/", title: "Home", metaDescription: "x", sections: [] },
  { slug: "/menu", title: "Menu", metaDescription: "x", sections: [] },
];

describe("renderSitemapXml", () => {
  it("lists every page URL, resolving '/' to the bare site URL", () => {
    const xml = renderSitemapXml("https://example.com", pages);
    expect(xml).toContain("<loc>https://example.com</loc>");
    expect(xml).toContain("<loc>https://example.com/menu</loc>");
  });

  it("produces well-formed XML with a urlset root", () => {
    const xml = renderSitemapXml("https://example.com", pages);
    expect(xml).toMatch(/^<\?xml version="1\.0"/);
    expect(xml).toContain("<urlset");
    expect(xml).toContain("</urlset>");
  });
});

describe("renderRobotsTxt", () => {
  it("references the site's sitemap", () => {
    const robots = renderRobotsTxt("https://example.com");
    expect(robots).toContain("Sitemap: https://example.com/sitemap.xml");
    expect(robots).toContain("Allow: /");
  });
});
