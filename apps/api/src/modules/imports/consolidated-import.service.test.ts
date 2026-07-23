import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtractedMenuData } from "./types";

// Ranking is exercised in image-ranking.test.ts; here we stub it so the
// orchestration logic (which sources run, merge, partial-failure handling)
// is tested deterministically without sharp/AI.
const selectMock = vi.fn();
vi.mock("./image-ranking", () => ({
  selectBestImagesForAnalysis: (...args: unknown[]) => selectMock(...args),
}));

const extractImagesMock = vi.fn();
vi.mock("./vision-extractor", () => ({
  extractMenuFromImageParts: (...args: unknown[]) => extractImagesMock(...args),
}));

const pdfExtract = vi.fn();
const websiteExtract = vi.fn();
const googleExtract = vi.fn();
vi.mock("./adapters/registry", () => ({
  importAdapterRegistry: {
    get: (sourceType: string) => {
      const map: Record<string, unknown> = {
        PDF: { implemented: true, extract: pdfExtract },
        WEBSITE: { implemented: true, extract: websiteExtract },
        GOOGLE_MAPS: { implemented: true, extract: googleExtract },
      };
      return map[sourceType];
    },
  },
}));

import { ConsolidatedExtractionFailedError, runConsolidatedExtraction } from "./consolidated-import.service";

function menu(categoryName: string, itemName: string, profile?: ExtractedMenuData["businessProfile"]): ExtractedMenuData {
  return {
    categories: [{ name: categoryName, items: [{ name: itemName, priceCents: 100 }] }],
    ...(profile ? { businessProfile: profile } : {}),
  };
}

function img(name: string) {
  return { buffer: Buffer.from(name), mimeType: "image/jpeg", originalName: name };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: pass images through unranked (analyzed = input, gallery = []).
  selectMock.mockImplementation((images: unknown[]) => Promise.resolve({ analyzed: images, gallery: [] }));
});

describe("runConsolidatedExtraction", () => {
  it("merges menus from images, PDF, website, and Google Maps into one result", async () => {
    extractImagesMock.mockResolvedValue(menu("Pizzas", "Margherita"));
    pdfExtract.mockResolvedValue(menu("Pasta", "Carbonara"));
    websiteExtract.mockResolvedValue(menu("Drinks", "Cola"));
    googleExtract.mockResolvedValue(menu("From Google", "Special", { name: "Bella", address: "123 Main", phone: "555" }));

    const result = await runConsolidatedExtraction({
      images: [img("a"), img("b")],
      pdfs: [{ buffer: Buffer.from("pdf"), mimeType: "application/pdf" }],
      websiteUrl: "https://example.com",
      googleMapsUrl: "https://maps.google.com/x",
    });

    expect(result.extracted.categories.map((c) => c.name)).toEqual(["Pizzas", "Pasta", "Drinks", "From Google"]);
    expect(result.extracted.businessProfile?.name).toBe("Bella");
    expect(result.analyzedImageCount).toBe(2);
    expect(result.galleryImageCount).toBe(0);
    expect(result.sourceErrors).toEqual([]);
  });

  it("only analyzes the best images and reports the rest as gallery", async () => {
    selectMock.mockResolvedValue({ analyzed: [img("best")], gallery: [img("x"), img("y")] });
    extractImagesMock.mockResolvedValue(menu("Menu", "Item"));

    const result = await runConsolidatedExtraction({ images: [img("best"), img("x"), img("y")], pdfs: [] });

    expect(extractImagesMock).toHaveBeenCalledTimes(1);
    expect(result.analyzedImageCount).toBe(1);
    expect(result.galleryImageCount).toBe(2);
  });

  it("tolerates a single failing source and still returns the others", async () => {
    extractImagesMock.mockResolvedValue(menu("Images", "FromImg"));
    websiteExtract.mockRejectedValue(new Error("site unreachable"));

    const result = await runConsolidatedExtraction({
      images: [img("a")],
      pdfs: [],
      websiteUrl: "https://broken.example",
    });

    expect(result.extracted.categories.map((c) => c.name)).toEqual(["Images"]);
    expect(result.sourceErrors).toEqual([{ source: "website", message: "site unreachable" }]);
  });

  it("throws when EVERY source fails, carrying the per-source errors", async () => {
    extractImagesMock.mockRejectedValue(new Error("vision down"));
    pdfExtract.mockRejectedValue(new Error("bad pdf"));

    await expect(
      runConsolidatedExtraction({
        images: [img("a")],
        pdfs: [{ buffer: Buffer.from("p"), mimeType: "application/pdf" }],
      }),
    ).rejects.toBeInstanceOf(ConsolidatedExtractionFailedError);
  });

  it("passes the configured image cap through to the ranker", async () => {
    extractImagesMock.mockResolvedValue(menu("Menu", "Item"));
    await runConsolidatedExtraction({ images: [img("a")], pdfs: [] }, { maxImagesToAnalyze: 3 });
    expect(selectMock).toHaveBeenCalledWith(expect.anything(), 3);
  });
});
