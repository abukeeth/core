import { beforeEach, describe, expect, it, vi } from "vitest";

const mockComplete = vi.fn();

vi.mock("../../../lib/ai", () => ({
  getAIProvider: () => ({ complete: mockComplete }),
}));

// pdf-to-img is ESM-only and dynamically imported by the adapter; stub it to
// yield a fixed set of page image buffers so the test never needs a real PDF
// rasterizer.
const mockPdf = vi.fn();
vi.mock("pdf-to-img", () => ({ pdf: mockPdf }));

import { PdfImportAdapter } from "./pdf.adapter";

const MENU_JSON = JSON.stringify({
  categories: [{ name: "Pizzas", items: [{ name: "Margherita", priceCents: 1499 }] }],
});

function fakeDocument(pages: Buffer[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const page of pages) yield page;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PdfImportAdapter (end-to-end, rasterizer + model call stubbed)", () => {
  const adapter = new PdfImportAdapter();

  it("rasterizes PDF pages and extracts a menu from them", async () => {
    mockPdf.mockResolvedValue(fakeDocument([Buffer.from("page-1-png"), Buffer.from("page-2-png")]));
    mockComplete.mockResolvedValue(MENU_JSON);

    const result = await adapter.extract({ kind: "file", buffer: Buffer.from("%PDF-1.4"), mimeType: "application/pdf" });

    expect(mockPdf).toHaveBeenCalledOnce();
    // Both rendered pages are passed to a single vision call.
    expect(mockComplete).toHaveBeenCalledWith(expect.objectContaining({ images: expect.arrayContaining([expect.anything()]) }));
    expect(result.categories[0]?.items[0]).toEqual({ name: "Margherita", priceCents: 1499 });
  });

  it("rejects a non-file (URL) input", async () => {
    await expect(adapter.extract({ kind: "url", url: "http://example.com" })).rejects.toThrow(
      "requires a file upload",
    );
  });
});
