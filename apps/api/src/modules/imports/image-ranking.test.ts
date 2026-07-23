import { beforeEach, describe, expect, it, vi } from "vitest";

// sharp is mocked so ranking is tested deterministically without real image decoding.
const metadataMock = vi.fn();
vi.mock("sharp", () => ({
  default: (_buffer: Buffer) => ({ metadata: metadataMock }),
}));

import { selectBestImagesForAnalysis } from "./image-ranking";

function img(name: string, bytes: number) {
  return { buffer: Buffer.alloc(bytes, name.charCodeAt(0)), mimeType: "image/jpeg", originalName: name };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("selectBestImagesForAnalysis", () => {
  it("returns everything as analyzed when at or under the cap (no ranking needed)", async () => {
    const images = [img("a", 10), img("b", 10)];
    const result = await selectBestImagesForAnalysis(images, 10);
    expect(result.analyzed).toHaveLength(2);
    expect(result.gallery).toHaveLength(0);
    expect(metadataMock).not.toHaveBeenCalled();
  });

  it("keeps only the highest-resolution N for analysis and the rest as gallery", async () => {
    // 3 images with resolutions small < medium < large; cap = 2 → the two
    // largest are analyzed, the smallest becomes gallery.
    const areas: Record<string, { width: number; height: number }> = {
      small: { width: 100, height: 100 }, // 10k
      medium: { width: 400, height: 400 }, // 160k
      large: { width: 1000, height: 1000 }, // 1M
    };
    const images = [img("small", 1), img("medium", 1), img("large", 1)];
    // metadata() is called once per image, in array order.
    const order = [areas.small, areas.medium, areas.large];
    let call = 0;
    metadataMock.mockImplementation(() => Promise.resolve(order[call++]!));

    const result = await selectBestImagesForAnalysis(images, 2);
    expect(result.analyzed.map((i) => i.originalName)).toEqual(["large", "medium"]);
    expect(result.gallery.map((i) => i.originalName)).toEqual(["small"]);
  });

  it("fails open: an image whose metadata throws ranks last, never crashes selection", async () => {
    const images = [img("broken", 1), img("good", 1)];
    let call = 0;
    metadataMock.mockImplementation(() => {
      call += 1;
      if (call === 1) return Promise.reject(new Error("bad image"));
      return Promise.resolve({ width: 800, height: 800 });
    });

    const result = await selectBestImagesForAnalysis(images, 1);
    expect(result.analyzed.map((i) => i.originalName)).toEqual(["good"]);
    expect(result.gallery.map((i) => i.originalName)).toEqual(["broken"]);
  });

  it("analyzes nothing when the cap is 0 (everything is gallery)", async () => {
    const result = await selectBestImagesForAnalysis([img("a", 1)], 0);
    expect(result.analyzed).toHaveLength(0);
    expect(result.gallery).toHaveLength(1);
  });
});
