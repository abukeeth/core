import { describe, expect, it } from "vitest";
import { findSocialLinks } from "./find-social-links";

describe("findSocialLinks", () => {
  it("finds known social platforms by link hostname", () => {
    const html = `
      <a href="https://www.facebook.com/joesdiner">FB</a>
      <a href="https://instagram.com/joesdiner">IG</a>
    `;
    expect(findSocialLinks(html, "https://example.com/")).toEqual([
      { platform: "facebook", url: "https://www.facebook.com/joesdiner" },
      { platform: "instagram", url: "https://instagram.com/joesdiner" },
    ]);
  });

  it("recognizes x.com as twitter", () => {
    const html = `<a href="https://x.com/joesdiner">X</a>`;
    expect(findSocialLinks(html, "https://example.com/")).toEqual([{ platform: "twitter", url: "https://x.com/joesdiner" }]);
  });

  it("keeps only the first URL seen per platform", () => {
    const html = `
      <a href="https://instagram.com/joesdiner">Header icon</a>
      <a href="https://instagram.com/joesdiner-alt">Footer icon</a>
    `;
    expect(findSocialLinks(html, "https://example.com/")).toEqual([{ platform: "instagram", url: "https://instagram.com/joesdiner" }]);
  });

  it("ignores links to unrelated domains", () => {
    const html = `<a href="https://example.com/about">About</a>`;
    expect(findSocialLinks(html, "https://example.com/")).toEqual([]);
  });

  it("resolves a relative href before checking its hostname (never matches, but must not throw)", () => {
    const html = `<a href="/about">About</a>`;
    expect(findSocialLinks(html, "https://example.com/")).toEqual([]);
  });
});
