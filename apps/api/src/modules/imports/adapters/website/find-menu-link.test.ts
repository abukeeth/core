import { describe, expect, it } from "vitest";
import { findMenuLink } from "./find-menu-link";

describe("findMenuLink", () => {
  it("finds a nav link whose text is exactly 'Menu'", () => {
    const html = `<nav><a href="/about">About</a><a href="/menu">Menu</a></nav>`;
    expect(findMenuLink(html, "https://example.com/")).toBe("https://example.com/menu");
  });

  it("scores an href containing 'menu' even with unrelated link text", () => {
    const html = `<a href="/our-menu-page">See what we serve</a>`;
    expect(findMenuLink(html, "https://example.com/")).toBe("https://example.com/our-menu-page");
  });

  it("prefers the higher-scoring candidate when multiple links qualify", () => {
    const html = `
      <a href="/order">Order now</a>
      <a href="/menu">Menu</a>
    `;
    expect(findMenuLink(html, "https://example.com/")).toBe("https://example.com/menu");
  });

  it("returns null when no link has any menu-related signal", () => {
    const html = `<a href="/about">About</a><a href="/contact">Contact</a>`;
    expect(findMenuLink(html, "https://example.com/")).toBeNull();
  });

  it("ignores a link that resolves back to the page itself", () => {
    const html = `<a href="/">Our Menu</a>`;
    expect(findMenuLink(html, "https://example.com/")).toBeNull();
  });

  it("returns null for a page with no links at all", () => {
    expect(findMenuLink("<p>No links here</p>", "https://example.com/")).toBeNull();
  });
});
