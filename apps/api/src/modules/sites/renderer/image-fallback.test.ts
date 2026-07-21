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

  it("Sprint 5 · T2 — renders a premium inline-SVG monogram tile using the theme display font", () => {
    const html = renderImageOrFallback("Spaghetti", undefined);
    expect(html).toContain("<svg");
    expect(html).toContain('role="img"');
    expect(html).toContain("var(--font-display)");
    expect(html).toContain("border-radius:var(--radius)");
    // Self-contained: no external asset and no hotlink.
    expect(html).not.toContain("http");
    expect(html).not.toContain("<defs");
  });

  it("Sprint 5 · T2 — is accessible: aria-label and <title> carry the item name", () => {
    const html = renderImageOrFallback("Zesty Tacos", undefined);
    expect(html).toContain('aria-label="Zesty Tacos"');
    expect(html).toContain("<title>Zesty Tacos</title>");
  });

  it("Sprint 5 · T2 — scales to the requested aspect ratio (thumbnail vs card)", () => {
    expect(renderImageOrFallback("Spaghetti", undefined, "1")).toContain("aspect-ratio:1;");
    expect(renderImageOrFallback("Spaghetti", undefined, "4/3")).toContain("aspect-ratio:4/3;");
  });
});
