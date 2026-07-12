import { describe, expect, it } from "vitest";
import { THEME_CATALOG } from "../theme-catalog";
import { renderThemeCss } from "./theme-css";

describe("renderThemeCss", () => {
  it("emits a <style> block with every color token's full scale", () => {
    const theme = THEME_CATALOG.find((t) => t.key === "modern-bistro")!;
    const css = renderThemeCss(theme, theme.tokens.colorSeed);
    for (const token of ["primary", "secondary", "accent", "surface", "text", "success", "error"]) {
      expect(css).toContain(`--color-${token}-500:`);
    }
  });

  it("includes the theme's font pairing", () => {
    const theme = THEME_CATALOG.find((t) => t.key === "fine-dining")!;
    const css = renderThemeCss(theme, theme.tokens.colorSeed);
    expect(css).toContain(theme.tokens.typography.display);
    expect(css).toContain(theme.tokens.typography.body);
  });

  it("forces motion duration to 0 under prefers-reduced-motion regardless of theme", () => {
    const energeticTheme = THEME_CATALOG.find((t) => t.tokens.motion === "energetic")!;
    const css = renderThemeCss(energeticTheme, energeticTheme.tokens.colorSeed);
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*:root \{ --motion-duration: 0ms; \}/);
  });

  it("gives every button/CTA a >=44px minimum touch target (§16)", () => {
    const theme = THEME_CATALOG.find((t) => t.key === "cafe")!;
    const css = renderThemeCss(theme, theme.tokens.colorSeed);
    expect(css).toContain("min-height: 44px");
    expect(css).toContain("min-width: 44px");
  });

  it("is deterministic for the same theme + seed", () => {
    const theme = THEME_CATALOG.find((t) => t.key === "cafe")!;
    expect(renderThemeCss(theme, "#123456")).toBe(renderThemeCss(theme, "#123456"));
  });
});
