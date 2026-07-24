import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("web app manifest", () => {
  it("is a standalone, installable PWA that opens on the Kitchen Display", () => {
    const result = manifest();

    expect(result.name).toBe("OrderVora");
    expect(result.display).toBe("standalone");
    expect(result.start_url).toBe("/dashboard/kitchen");
  });

  it("declares icons (any + maskable) so it can install to a home screen", () => {
    const result = manifest();
    const icons = result.icons ?? [];

    expect(icons.length).toBeGreaterThan(0);
    expect(icons.every((icon) => icon.src === "/icon.svg")).toBe(true);
    expect(icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  });
});
