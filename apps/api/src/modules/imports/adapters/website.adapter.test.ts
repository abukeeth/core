import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/safe-fetch", () => ({
  safeFetch: vi.fn(),
}));

vi.mock("../vision-extractor", () => ({
  extractMenuFromText: vi.fn(),
  extractMenuFromImages: vi.fn(),
}));

import { safeFetch } from "../../../lib/safe-fetch";
import { extractMenuFromImages, extractMenuFromText } from "../vision-extractor";
import { WebsiteImportAdapter } from "./website.adapter";

const mockSafeFetch = vi.mocked(safeFetch);
const mockExtractText = vi.mocked(extractMenuFromText);
const mockExtractImages = vi.mocked(extractMenuFromImages);

beforeEach(() => {
  vi.clearAllMocks();
  process.env.IMPORT_WEBSITE_MAX_IMAGES = "5";
});

const adapter = new WebsiteImportAdapter();

function htmlPage(body: string) {
  return `<html><body>${body}</body></html>`;
}

describe("WebsiteImportAdapter", () => {
  it("reports itself as implemented and url-based", () => {
    expect(adapter.implemented).toBe(true);
    expect(adapter.inputKind).toBe("url");
  });

  it("extracts from page text when there are no images", async () => {
    mockSafeFetch.mockResolvedValueOnce({
      buffer: Buffer.from(htmlPage("<h1>Menu</h1><p>Burger $12</p>")),
      contentType: "text/html",
      finalUrl: "https://example.com/",
    });
    mockExtractText.mockResolvedValue({ categories: [{ name: "Mains", items: [] }] });

    const result = await adapter.extract({ kind: "url", url: "https://example.com/" });

    expect(mockExtractText).toHaveBeenCalledWith(expect.stringContaining("Burger $12"));
    expect(mockExtractImages).not.toHaveBeenCalled();
    expect(result.categories).toEqual([{ name: "Mains", items: [] }]);
  });

  it("fetches and extracts ranked candidate images, merging with the text result", async () => {
    mockSafeFetch
      .mockResolvedValueOnce({
        buffer: Buffer.from(htmlPage('<h2>Our Menu</h2><img src="/menu.jpg" alt="menu photo">')),
        contentType: "text/html",
        finalUrl: "https://example.com/",
      })
      .mockResolvedValueOnce({
        buffer: Buffer.from("fake-image-bytes"),
        contentType: "image/jpeg",
        finalUrl: "https://example.com/menu.jpg",
      });
    mockExtractText.mockResolvedValue({ categories: [{ name: "From Text", items: [] }] });
    mockExtractImages.mockResolvedValue({ categories: [{ name: "From Image", items: [] }] });

    const result = await adapter.extract({ kind: "url", url: "https://example.com/" });

    expect(mockExtractImages).toHaveBeenCalledWith([Buffer.from("fake-image-bytes")], "image/jpeg");
    expect(result.categories.map((c) => c.name)).toEqual(["From Text", "From Image"]);
  });

  it("caps the number of images processed at IMPORT_WEBSITE_MAX_IMAGES", async () => {
    process.env.IMPORT_WEBSITE_MAX_IMAGES = "1";
    const imgs = Array.from({ length: 3 }, (_, i) => `<img src="/img${i}.jpg">`).join("");
    mockSafeFetch.mockResolvedValueOnce({
      buffer: Buffer.from(htmlPage(imgs)),
      contentType: "text/html",
      finalUrl: "https://example.com/",
    });
    mockSafeFetch.mockResolvedValue({
      buffer: Buffer.from("bytes"),
      contentType: "image/jpeg",
      finalUrl: "https://example.com/img0.jpg",
    });
    mockExtractText.mockResolvedValue({ categories: [] });
    mockExtractImages.mockResolvedValue({ categories: [] });

    await adapter.extract({ kind: "url", url: "https://example.com/" });

    // 1 page fetch + 1 image fetch (capped from 3 candidates to 1)
    expect(mockSafeFetch).toHaveBeenCalledTimes(2);
  });

  it("does not fail the whole import when one image fails to fetch", async () => {
    mockSafeFetch
      .mockResolvedValueOnce({
        buffer: Buffer.from(htmlPage('<p>Burger $12</p><img src="/broken.jpg">')),
        contentType: "text/html",
        finalUrl: "https://example.com/",
      })
      .mockRejectedValueOnce(new Error("fetch failed"));
    mockExtractText.mockResolvedValue({ categories: [{ name: "From Text", items: [] }] });

    const result = await adapter.extract({ kind: "url", url: "https://example.com/" });

    expect(result.categories).toEqual([{ name: "From Text", items: [] }]);
  });

  it("rejects a non-url input", async () => {
    await expect(
      adapter.extract({ kind: "file", buffer: Buffer.from(""), mimeType: "application/pdf" }),
    ).rejects.toThrow();
  });

  describe("menu-link crawl + social links (Sprint 10)", () => {
    it("follows a discovered 'Menu' nav link as one bounded extra hop and merges its extraction", async () => {
      mockSafeFetch
        .mockResolvedValueOnce({
          buffer: Buffer.from(htmlPage('<nav><a href="/menu">Menu</a></nav><p>Welcome to Joe\'s</p>')),
          contentType: "text/html",
          finalUrl: "https://example.com/",
        })
        .mockResolvedValueOnce({
          buffer: Buffer.from(htmlPage("<p>Burger $12</p>")),
          contentType: "text/html",
          finalUrl: "https://example.com/menu",
        });
      mockExtractText
        .mockResolvedValueOnce({ categories: [{ name: "From Home Page", items: [] }] })
        .mockResolvedValueOnce({ categories: [{ name: "From Menu Page", items: [] }] });

      const result = await adapter.extract({ kind: "url", url: "https://example.com/" });

      expect(mockSafeFetch).toHaveBeenCalledWith("https://example.com/menu");
      expect(result.categories.map((c) => c.name)).toEqual(["From Home Page", "From Menu Page"]);
    });

    it("does not follow any extra link when no menu-like link is found on the page", async () => {
      mockSafeFetch.mockResolvedValueOnce({
        buffer: Buffer.from(htmlPage('<a href="/about">About</a><p>Burger $12</p>')),
        contentType: "text/html",
        finalUrl: "https://example.com/",
      });
      mockExtractText.mockResolvedValue({ categories: [{ name: "From Text", items: [] }] });

      await adapter.extract({ kind: "url", url: "https://example.com/" });

      expect(mockSafeFetch).toHaveBeenCalledTimes(1);
    });

    it("still returns the original page's result when following the discovered menu link fails", async () => {
      mockSafeFetch
        .mockResolvedValueOnce({
          buffer: Buffer.from(htmlPage('<a href="/menu">Menu</a><p>Burger $12</p>')),
          contentType: "text/html",
          finalUrl: "https://example.com/",
        })
        .mockRejectedValueOnce(new Error("fetch failed"));
      mockExtractText.mockResolvedValue({ categories: [{ name: "From Text", items: [] }] });

      const result = await adapter.extract({ kind: "url", url: "https://example.com/" });

      expect(result.categories).toEqual([{ name: "From Text", items: [] }]);
    });

    it("surfaces social links found on the page into businessProfile.socialLinks", async () => {
      mockSafeFetch.mockResolvedValueOnce({
        buffer: Buffer.from(htmlPage('<a href="https://instagram.com/joesdiner">IG</a><p>Burger $12</p>')),
        contentType: "text/html",
        finalUrl: "https://example.com/",
      });
      mockExtractText.mockResolvedValue({ categories: [] });

      const result = await adapter.extract({ kind: "url", url: "https://example.com/" });

      expect(result.businessProfile?.socialLinks).toEqual([{ platform: "instagram", url: "https://instagram.com/joesdiner" }]);
    });
  });
});
