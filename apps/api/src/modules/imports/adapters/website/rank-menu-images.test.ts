import { describe, expect, it } from "vitest";
import { rankMenuImages } from "./rank-menu-images";

describe("rankMenuImages", () => {
  it("ranks an image with menu-related alt text above one with none", () => {
    const [first, second] = rankMenuImages([
      { src: "/img/photo1.jpg" },
      { src: "/img/photo2.jpg", alt: "Our full menu" },
    ]);

    expect(first?.src).toBe("/img/photo2.jpg");
    expect(second?.src).toBe("/img/photo1.jpg");
  });

  it("ranks an image under a menu-related heading above one under an unrelated heading", () => {
    const [first, second] = rankMenuImages([
      { src: "/img/a.jpg", nearbyHeading: "About Us" },
      { src: "/img/b.jpg", nearbyHeading: "Our Menu" },
    ]);

    expect(first?.src).toBe("/img/b.jpg");
    expect(second?.src).toBe("/img/a.jpg");
  });

  it("ranks a menu-like filename above a logo/icon filename", () => {
    const [first, second] = rankMenuImages([
      { src: "https://example.com/assets/site-logo-icon.png" },
      { src: "https://example.com/assets/dinner-menu-card.jpg" },
    ]);

    expect(first?.src).toContain("dinner-menu-card");
    expect(second?.src).toContain("site-logo-icon");
  });

  it("ranks a large image above a tiny (icon-sized) image", () => {
    const [first, second] = rankMenuImages([
      { src: "/img/icon.png", width: 32, height: 32 },
      { src: "/img/photo.jpg", width: 800, height: 600 },
    ]);

    expect(first?.src).toBe("/img/photo.jpg");
    expect(second?.src).toBe("/img/icon.png");
  });

  it("still returns every candidate, ranked, even when none has any positive signal", () => {
    const candidates = [{ src: "/img/one.jpg" }, { src: "/img/two.jpg" }, { src: "/img/three.jpg" }];

    const result = rankMenuImages(candidates);

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.src).sort()).toEqual(candidates.map((c) => c.src).sort());
  });
});
