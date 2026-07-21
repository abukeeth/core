import { describe, expect, it } from "vitest";
import type { BrandKit } from "./brand-kit";
import { getVerticalProfile } from "./vertical-profiles";
import { buildImageRequest } from "./prompt-builder";

function brandKit(vertical: string): BrandKit {
  const p = getVerticalProfile(vertical);
  return { vertical, palette: p.palette, vocabulary: p.vocabulary, tone: p.tone, tagline: "t", brandStory: "s", artDirection: p.artDirection, source: "fallback" };
}

describe("buildImageRequest", () => {
  it("frames hero as landscape and includes the palette and brand tone", () => {
    const req = buildImageRequest(brandKit("VAPE_SHOP"), "hero");
    expect(req.aspect).toBe("landscape");
    expect(req.prompt).toContain("#0B0713"); // brand background
    expect(req.prompt).toContain("premium"); // tone adjective
    expect(req.prompt).toContain("no text");
  });

  it("frames category as portrait and includes the category name", () => {
    const req = buildImageRequest(brandKit("DELI"), "category", { categoryName: "Sandwiches" });
    expect(req.aspect).toBe("portrait");
    expect(req.prompt).toContain("Sandwiches");
  });

  it("always forbids text/logos/people and branded products in the negative prompt", () => {
    const req = buildImageRequest(brandKit("VAPE_SHOP"), "hero");
    expect(req.negativePrompt).toContain("logo");
    expect(req.negativePrompt).toContain("people");
    expect(req.negativePrompt).toContain("branded products");
    // vape adds restricted-goods negatives
    expect(req.negativePrompt).toContain("cigarettes");
  });
});
