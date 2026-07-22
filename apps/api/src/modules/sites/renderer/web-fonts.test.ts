import { describe, expect, it } from "vitest";
import { renderWebFonts } from "./web-fonts";

describe("renderWebFonts", () => {
  it("loads the theme's display + body fonts from Google Fonts with preconnect + display=swap", () => {
    const out = renderWebFonts("Playfair Display", "Inter");
    expect(out).toContain('rel="preconnect" href="https://fonts.googleapis.com"');
    expect(out).toContain('href="https://fonts.gstatic.com" crossorigin');
    expect(out).toContain("family=Playfair+Display:wght@");
    expect(out).toContain("family=Inter:wght@");
    expect(out).toContain("display=swap");
    expect(out).toContain('rel="stylesheet"');
  });

  it("collapses duplicates (display === body) into a single family request", () => {
    const out = renderWebFonts("Inter", "Inter");
    expect(out.match(/family=Inter:/g)).toHaveLength(1);
  });

  it("skips unknown families so a bad name degrades to the system fallback, not a failed request", () => {
    expect(renderWebFonts("Totally Made Up Face", undefined)).toBe("");
    const mixed = renderWebFonts("Made Up", "Lora");
    expect(mixed).toContain("family=Lora:");
    expect(mixed).not.toContain("Made+Up");
  });

  it("covers every font used by the theme catalog", () => {
    for (const font of ["Playfair Display", "Space Grotesk", "Inter", "Fraunces", "Lora", "Nunito Sans", "Sora", "IBM Plex Mono", "Bricolage Grotesque"]) {
      expect(renderWebFonts(font), font).toContain(`family=${font.replace(/\s+/g, "+")}:`);
    }
  });

  it("returns nothing when no loadable fonts are given (clean head, system fallback)", () => {
    expect(renderWebFonts(undefined, "")).toBe("");
  });
});
