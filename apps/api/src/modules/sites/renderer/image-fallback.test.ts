import { describe, expect, it } from "vitest";
import { renderImageOrFallback } from "./image-fallback";

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
