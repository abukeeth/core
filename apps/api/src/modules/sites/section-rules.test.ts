import { describe, expect, it } from "vitest";
import { filterSectionsByAvailability } from "./section-rules";
import type { SectionType } from "./types";

const FULL_ORDER: SectionType[] = ["hero", "signatureDishes", "aboutTeaser", "hoursLocation", "gallery", "testimonials", "ctaBanner", "footer"];

describe("filterSectionsByAvailability", () => {
  it("keeps everything except testimonials when all data is available", () => {
    const result = filterSectionsByAvailability(FULL_ORDER, {
      hasMenuItems: true,
      hasPhotos: true,
      hasHoursOrLocation: true,
    });
    expect(result).toEqual(["hero", "signatureDishes", "aboutTeaser", "hoursLocation", "gallery", "ctaBanner", "footer"]);
  });

  it("drops signatureDishes and menu when there are no menu items", () => {
    const result = filterSectionsByAvailability(["hero", "signatureDishes", "menu", "footer"], {
      hasMenuItems: false,
      hasPhotos: true,
      hasHoursOrLocation: true,
    });
    expect(result).toEqual(["hero", "footer"]);
  });

  it("drops gallery when there are no photos", () => {
    const result = filterSectionsByAvailability(["hero", "gallery", "footer"], {
      hasMenuItems: true,
      hasPhotos: false,
      hasHoursOrLocation: true,
    });
    expect(result).toEqual(["hero", "footer"]);
  });

  it("drops hoursLocation when there's no address or hours data", () => {
    const result = filterSectionsByAvailability(["hero", "hoursLocation", "footer"], {
      hasMenuItems: true,
      hasPhotos: true,
      hasHoursOrLocation: false,
    });
    expect(result).toEqual(["hero", "footer"]);
  });

  it("always excludes testimonials, regardless of availability flags", () => {
    const result = filterSectionsByAvailability(["hero", "testimonials", "footer"], {
      hasMenuItems: true,
      hasPhotos: true,
      hasHoursOrLocation: true,
    });
    expect(result).not.toContain("testimonials");
  });

  it("preserves the theme's original section order", () => {
    const result = filterSectionsByAvailability(FULL_ORDER, {
      hasMenuItems: true,
      hasPhotos: false,
      hasHoursOrLocation: true,
    });
    expect(result.indexOf("hero")).toBeLessThan(result.indexOf("signatureDishes"));
    expect(result.indexOf("aboutTeaser")).toBeLessThan(result.indexOf("footer"));
  });
});
