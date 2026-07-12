import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { generateImageRenditions, isRasterImageMimeType, resolveAssetRenditionKey } from "./image-processing";

async function makePng(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 100, g: 150, b: 200 } } })
    .png()
    .toBuffer();
}

describe("isRasterImageMimeType", () => {
  it("accepts the raster types SiteAsset uploads are already restricted to", () => {
    expect(isRasterImageMimeType("image/png")).toBe(true);
    expect(isRasterImageMimeType("image/jpeg")).toBe(true);
    expect(isRasterImageMimeType("image/webp")).toBe(true);
    expect(isRasterImageMimeType("image/gif")).toBe(true);
  });

  it("rejects non-raster or unexpected types", () => {
    expect(isRasterImageMimeType("application/pdf")).toBe(false);
    expect(isRasterImageMimeType("text/plain")).toBe(false);
  });
});

describe("generateImageRenditions", () => {
  it("produces thumbnail/card/full WebP variants with correctly capped widths for a large input", async () => {
    const original = await makePng(2400, 1200);

    const renditions = await generateImageRenditions(original, "image/png");
    expect(renditions).not.toBeNull();

    const thumb = await sharp(renditions!.thumbnail).metadata();
    const card = await sharp(renditions!.card).metadata();
    const full = await sharp(renditions!.full).metadata();

    expect(thumb.format).toBe("webp");
    expect(thumb.width).toBe(200);
    expect(card.width).toBe(600);
    expect(full.width).toBe(1600);
    // aspect ratio preserved (2:1 input)
    expect(thumb.height).toBe(100);
  });

  it("does not upscale an input smaller than a variant's target width", async () => {
    const small = await makePng(150, 150);

    const renditions = await generateImageRenditions(small, "image/png");
    expect(renditions).not.toBeNull();

    const thumb = await sharp(renditions!.thumbnail).metadata();
    const full = await sharp(renditions!.full).metadata();

    expect(thumb.width).toBe(150);
    expect(full.width).toBe(150);
  });

  it("returns null (fails open) for a non-raster mime type without attempting to decode", async () => {
    const result = await generateImageRenditions(Buffer.from("%PDF-1.4"), "application/pdf");
    expect(result).toBeNull();
  });

  it("returns null (fails open) for corrupted/truncated bytes claiming to be an image, rather than throwing", async () => {
    const corrupted = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0x03]);
    await expect(generateImageRenditions(corrupted, "image/png")).resolves.toBeNull();
  });
});

describe("resolveAssetRenditionKey", () => {
  it("picks the requested variant's storage key when renditions are present", () => {
    const asset = { storageKey: "uploads/original.png", renditions: { thumbnail: "uploads/t.webp", card: "uploads/c.webp", full: "uploads/f.webp" } };
    expect(resolveAssetRenditionKey(asset, "card")).toBe("uploads/c.webp");
    expect(resolveAssetRenditionKey(asset, "full")).toBe("uploads/f.webp");
  });

  it("falls back to the original storageKey when renditions is null (never processed, or resizing failed open)", () => {
    const asset = { storageKey: "uploads/original.png", renditions: null };
    expect(resolveAssetRenditionKey(asset, "card")).toBe("uploads/original.png");
  });

  it("falls back to the original storageKey when renditions is entirely absent", () => {
    const asset = { storageKey: "uploads/original.png", renditions: undefined };
    expect(resolveAssetRenditionKey(asset, "thumbnail")).toBe("uploads/original.png");
  });
});
