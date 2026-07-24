import { beforeEach, describe, expect, it, vi } from "vitest";

const mockComplete = vi.fn();

// Replaces src/lib/ai for every importer (incl. vision-extractor), so this
// exercises the real adapter → vision-extractor → parser → schema chain with
// only the external model call stubbed.
vi.mock("../../../lib/ai", () => ({
  getAIProvider: () => ({ complete: mockComplete }),
}));

import { ImageImportAdapter } from "./image.adapter";

const MENU_JSON = JSON.stringify({
  categories: [{ name: "Pizzas", items: [{ name: "Margherita", priceCents: 1499 }] }],
  businessProfile: { name: "Pizza Palace" },
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ImageImportAdapter (end-to-end, model call stubbed)", () => {
  const adapter = new ImageImportAdapter();

  it("extracts a menu from an image buffer, surviving a fenced ```json model response", async () => {
    mockComplete.mockResolvedValue("```json\n" + MENU_JSON + "\n```");

    const result = await adapter.extract({ kind: "file", buffer: Buffer.from("fake-image"), mimeType: "image/jpeg" });

    expect(result.categories[0]?.items[0]).toEqual({ name: "Margherita", priceCents: 1499 });
    expect(result.businessProfile?.name).toBe("Pizza Palace");
  });

  it("rejects an unsupported image mime type before calling the model", async () => {
    await expect(
      adapter.extract({ kind: "file", buffer: Buffer.from("x"), mimeType: "image/tiff" }),
    ).rejects.toThrow("Unsupported image type");
    expect(mockComplete).not.toHaveBeenCalled();
  });

  it("rejects a non-file (URL) input", async () => {
    await expect(adapter.extract({ kind: "url", url: "http://example.com" })).rejects.toThrow(
      "requires a file upload",
    );
  });
});
