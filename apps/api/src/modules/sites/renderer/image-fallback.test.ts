import { describe, expect, it } from "vitest";
import { generatedGradient, renderImageOrFallback, renderPhoto } from "./image-fallback";

describe("renderImageOrFallback — §Website Builder polished deterministic fallback", () => {
  it("renders a real <img> when a URL is present", () => {
    const html = renderImageOrFallback("Spaghetti", "/assets/spaghetti.png");
    expect(html).toContain('<img src="/assets/spaghetti.png"');
    expect(html).toContain('alt="Spaghetti"');
  });

  it("renders a non-photographic fallback tile (no <img>) when there's no uploaded photo", () => {
    const html = renderImageOrFallback("Spaghetti", undefined);
    expect(html).not.toContain("<img");
    expect(html).toContain(">S<");
  });

  it("is deterministic — the same name always produces the identical fallback markup", () => {
    const first = renderImageOrFallback("Spaghetti", undefined);
    const second = renderImageOrFallback("Spaghetti", undefined);
    expect(first).toBe(second);
  });

  it("produces different-looking fallbacks for different names (not one fixed placeholder)", () => {
    const a = renderImageOrFallback("Spaghetti", undefined);
    const b = renderImageOrFallback("Zesty Tacos", undefined);
    expect(a).not.toBe(b);
  });

  it("escapes the name in both the <img> alt text and the fallback label", () => {
    const withImage = renderImageOrFallback("<script>x</script>", "/assets/x.png");
    expect(withImage).not.toContain("<script>x</script>");

    const fallback = renderImageOrFallback("<script>x</script>", undefined);
    expect(fallback).not.toContain("<script>x</script>");
  });
});

describe("renderPhoto — Theme Engine V2 hybrid image primitive", () => {
  it("prefers a real uploaded photo, layered over the generated gradient", () => {
    const html = renderPhoto({ name: "Carbonara", imageUrl: "/assets/carbonara.png", stockUrl: "https://images.unsplash.com/photo-x" });
    expect(html).toContain('url("/assets/carbonara.png")');
    // The uploaded photo wins — the stock URL is not used when an upload exists.
    expect(html).not.toContain("photo-x");
    expect(html).toContain("linear-gradient(");
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Carbonara"');
  });

  it("uses the curated stock photo over the gradient when there's no upload", () => {
    const html = renderPhoto({ name: "Carbonara", stockUrl: "https://images.unsplash.com/photo-abc" });
    expect(html).toContain('url("https://images.unsplash.com/photo-abc")');
    expect(html).toContain("linear-gradient(");
  });

  it("still renders the generated gradient (never an empty box) when neither photo is supplied", () => {
    const html = renderPhoto({ name: "Carbonara" });
    expect(html).toContain("linear-gradient(");
    expect(html).not.toContain("url(");
  });

  it("escapes the accessible label and honors the aspect ratio", () => {
    const html = renderPhoto({ name: "<b>x</b>", aspectRatio: "16/9" });
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("aspect-ratio:16/9");
  });

  it("generatedGradient is deterministic per name and differs across names", () => {
    expect(generatedGradient("A")).toBe(generatedGradient("A"));
    expect(generatedGradient("A")).not.toBe(generatedGradient("Totally Different"));
  });
});
