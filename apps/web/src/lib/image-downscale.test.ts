import { describe, expect, it } from "vitest";
import { DOWNSCALE_MIN_BYTES, downscaleImageFile } from "./image-downscale";

function fileOfSize(bytes: number, name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("downscaleImageFile — fail-open, only touches large raster photos", () => {
  it("passes a non-image file through untouched", async () => {
    const pdf = fileOfSize(DOWNSCALE_MIN_BYTES + 1000, "menu.pdf", "application/pdf");
    expect(await downscaleImageFile(pdf)).toBe(pdf);
  });

  it("passes a small image through untouched (not worth the round-trip)", async () => {
    const small = new File(["img"], "menu.png", { type: "image/png" });
    expect(await downscaleImageFile(small)).toBe(small);
  });

  it("leaves GIFs and SVGs alone (not meaningfully raster-downscalable)", async () => {
    const gif = fileOfSize(DOWNSCALE_MIN_BYTES + 1000, "menu.gif", "image/gif");
    const svg = fileOfSize(DOWNSCALE_MIN_BYTES + 1000, "menu.svg", "image/svg+xml");
    expect(await downscaleImageFile(gif)).toBe(gif);
    expect(await downscaleImageFile(svg)).toBe(svg);
  });

  it("returns the original when the environment has no canvas/decoder (SSR/jsdom) — never throws or blocks the upload", async () => {
    // jsdom provides no createImageBitmap/canvas encoding, so a genuinely
    // large photo must still come back unchanged rather than error.
    const bigPhoto = fileOfSize(DOWNSCALE_MIN_BYTES + 500_000, "menu.jpg", "image/jpeg");
    const result = await downscaleImageFile(bigPhoto);
    expect(result).toBe(bigPhoto);
  });
});
