import { describe, expect, it } from "vitest";
import { BUILD_STEPS, VALUE_PITCH_ITEMS, overallProgressPercent, statusFor, stepIndex } from "./build-steps";

describe("build-steps", () => {
  it("orders steps to match real backend execution order (INGEST first, PROVISIONING last)", () => {
    expect(BUILD_STEPS[0]!.id).toBe("INGEST");
    expect(BUILD_STEPS.at(-1)!.id).toBe("PROVISIONING");
  });

  it("stepIndex finds a step's position", () => {
    expect(stepIndex("THEME_SELECTION")).toBeGreaterThan(stepIndex("INGEST"));
    expect(stepIndex("unknown-step")).toBe(-1);
  });

  describe("statusFor", () => {
    it("marks earlier steps done, the current step active, and later steps upcoming", () => {
      expect(statusFor("INGEST", "THEME_SELECTION")).toBe("done");
      expect(statusFor("THEME_SELECTION", "THEME_SELECTION")).toBe("active");
      expect(statusFor("PUBLISHING", "THEME_SELECTION")).toBe("upcoming");
    });

    it("treats an unknown active id as everything upcoming", () => {
      expect(statusFor("INGEST", "not-a-real-step")).toBe("upcoming");
    });
  });

  describe("overallProgressPercent", () => {
    it("is 0 for an unrecognized active step", () => {
      expect(overallProgressPercent("not-a-real-step")).toBe(0);
    });

    it("is 100 for the last step", () => {
      expect(overallProgressPercent("PROVISIONING")).toBe(100);
    });

    it("increases monotonically through the pipeline", () => {
      const first = overallProgressPercent("INGEST");
      const middle = overallProgressPercent("ASSEMBLY");
      const last = overallProgressPercent("PROVISIONING");
      expect(first).toBeLessThan(middle);
      expect(middle).toBeLessThan(last);
    });

    it("is weighted rather than uniform — a long AI stage advances progress more than a near-instant one", () => {
      const afterContentGeneration = overallProgressPercent("CONTENT_GENERATION") - overallProgressPercent("THEME_SELECTION");
      const afterProvisioning = overallProgressPercent("PROVISIONING") - overallProgressPercent("PUBLISHING");
      expect(afterContentGeneration).toBeGreaterThan(afterProvisioning);
    });
  });

  describe("captions", () => {
    it("personalizes captions with the restaurant name", () => {
      const ingest = BUILD_STEPS.find((s) => s.id === "INGEST")!;
      expect(ingest.captions({ restaurantName: "Joe's Diner" })[0]).toContain("Joe's Diner");
    });

    it("falls back to generic copy before the cuisine/tagline are known, and personalizes once they are", () => {
      const brandAnalysis = BUILD_STEPS.find((s) => s.id === "BRAND_ANALYSIS")!;
      expect(brandAnalysis.captions({ restaurantName: "Joe's Diner" }).join(" ")).toContain("your cuisine and style");
      expect(brandAnalysis.captions({ restaurantName: "Joe's Diner", cuisine: "Italian" }).join(" ")).toContain(
        "Italian cuisine",
      );
    });
  });

  describe("VALUE_PITCH_ITEMS", () => {
    it("lists the finished-business deliverables gated by real build stages", () => {
      expect(VALUE_PITCH_ITEMS.map((i) => i.label)).toEqual(["Website", "Mobile-ready", "SEO", "QR ordering"]);
      for (const item of VALUE_PITCH_ITEMS) {
        expect(stepIndex(item.doneAtStepId)).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
