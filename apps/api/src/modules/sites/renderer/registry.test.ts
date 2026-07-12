import { describe, expect, it } from "vitest";
import { getSectionRenderer, registeredSectionTypes } from "./registry";
import { sectionTypeSchema } from "../types";

describe("registry", () => {
  it("registers a renderer for every section type except testimonials", () => {
    const allTypes = sectionTypeSchema.options;
    for (const type of allTypes) {
      if (type === "testimonials") {
        expect(getSectionRenderer(type)).toBeUndefined();
      } else {
        expect(getSectionRenderer(type)).toBeDefined();
      }
    }
  });

  it("never registers testimonials (no fabricated-testimonial data source exists)", () => {
    expect(registeredSectionTypes()).not.toContain("testimonials");
  });
});
