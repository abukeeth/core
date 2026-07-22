import { describe, expect, it } from "vitest";
import type { CreativeBrief } from "../contracts";
import { validateDiversity } from "./diversity-validator";

function brief(over: Partial<CreativeBrief> & { id: string }): CreativeBrief {
  return {
    schemaVersion: 1,
    centralIdea: "idea",
    targetCustomer: "people",
    brandPersonality: ["warm", "honest"],
    valueProposition: "value",
    differentiator: "diff",
    copyVoice: { voice: "v", sampleHeadline: "h", sampleCta: "Order now" },
    photography: { treatment: "t", lighting: "soft daylight", backdrop: "pale surfaces", subjects: ["s"] },
    typography: { display: "Fraunces", body: "Inter" },
    colorLogic: { rationale: "r", ground: { hex: "#15110C", luminanceClass: "dark" }, ink: "#F4EADB", brand: "#E07A2F", accent: "#E07A2F" },
    heroConcept: { composition: "cinematic", headline: "h", subhead: "s", imageSubject: "i" },
    productPresentation: { layout: "editorial-rows", emphasis: "e" },
    conversionStrategy: { primaryCta: "Order now", trustSignals: [] },
    structure: { home: ["hero", "signatureDishes", "aboutTeaser", "footer"] },
    ...over,
  } as CreativeBrief;
}

describe("validateDiversity", () => {
  it("REJECTS 'same site, different colors' — hard axes fail even with distinct palettes", () => {
    const report = validateDiversity([
      brief({ id: "a" }),
      brief({ id: "b", colorLogic: { rationale: "r", ground: { hex: "#FFFFFF", luminanceClass: "light" }, ink: "#111111", brand: "#0044AA", accent: "#AA4400" } }),
      brief({ id: "c", colorLogic: { rationale: "r", ground: { hex: "#F5E0C8", luminanceClass: "tinted" }, ink: "#221100", brand: "#884400", accent: "#008844" } }),
    ]);
    expect(report.pass).toBe(false);
    expect(report.pairs.every((p) => p.hardFailures.some((f) => /hero|typeface/.test(f)))).toBe(true);
  });

  it("ACCEPTS three genuinely different directions and reports every pair passing", () => {
    const report = validateDiversity([
      brief({ id: "a" }),
      brief({
        id: "b",
        typography: { display: "Space Grotesk", body: "DM Sans" },
        heroConcept: { composition: "minimal-typographic", headline: "h2", subhead: "s2", imageSubject: "i2" },
        colorLogic: { rationale: "r", ground: { hex: "#FFFFFF", luminanceClass: "light" }, ink: "#141417", brand: "#0E7A3C", accent: "#0E7A3C" },
        productPresentation: { layout: "card-grid", emphasis: "grid" },
        brandPersonality: ["precise", "modern"],
        photography: { treatment: "clean", lighting: "bright airy studio", backdrop: "seamless white", subjects: ["product"] },
        conversionStrategy: { primaryCta: "Order pickup", trustSignals: [] },
        structure: { home: ["hero", "featuredCategories", "features", "hoursLocation", "footer"] },
      }),
      brief({
        id: "c",
        typography: { display: "Nunito Sans", body: "Nunito Sans" },
        heroConcept: { composition: "warm-frame", headline: "h3", subhead: "s3", imageSubject: "i3" },
        colorLogic: { rationale: "r", ground: { hex: "#FBF4E2", luminanceClass: "tinted" }, ink: "#26251F", brand: "#2E6B3A", accent: "#D8502E" },
        productPresentation: { layout: "warm-cards", emphasis: "warm" },
        brandPersonality: ["neighborly", "fresh"],
        photography: { treatment: "rustic", lighting: "golden morning glow", backdrop: "wooden market crates", subjects: ["counter"] },
        conversionStrategy: { primaryCta: "Stop by today", trustSignals: [] },
        structure: { home: ["hero", "gallery", "signatureDishes", "reviews", "ctaBanner", "footer"] },
      }),
    ]);
    expect(report.pass).toBe(true);
  });

  it("names the weakest brief so regeneration can target it", () => {
    const report = validateDiversity([
      brief({ id: "a" }),
      brief({ id: "b" }), // clone of a — fails against both others
      brief({
        id: "c",
        typography: { display: "Sora", body: "Work Sans" },
        heroConcept: { composition: "bold-block", headline: "x", subhead: "y", imageSubject: "z" },
        colorLogic: { rationale: "r", ground: { hex: "#FFFFFF", luminanceClass: "light" }, ink: "#111111", brand: "#222222", accent: "#333333" },
        productPresentation: { layout: "bold-grid", emphasis: "bold" },
        brandPersonality: ["loud", "direct"],
        photography: { treatment: "punchy", lighting: "hard flash contrast", backdrop: "concrete studio", subjects: ["p"] },
        conversionStrategy: { primaryCta: "Shop now", trustSignals: [] },
        structure: { home: ["hero", "featuredProducts", "ctaBanner", "footer"] },
      }),
    ]);
    expect(report.pass).toBe(false);
    expect(["a", "b"]).toContain(report.weakestBriefId);
  });
});
