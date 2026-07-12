import { describe, expect, it } from "vitest";
import { detectNewOrderIds, formatElapsed, getElapsedSeverity } from "./kitchen-display";

describe("formatElapsed", () => {
  it("formats sub-minute elapsed time as 0:SS", () => {
    const placedAt = new Date(1_000_000).toISOString();
    expect(formatElapsed(placedAt, 1_000_000 + 45_000)).toBe("0:45");
  });

  it("formats multi-minute elapsed time with zero-padded seconds", () => {
    const placedAt = new Date(0).toISOString();
    expect(formatElapsed(placedAt, 12 * 60_000 + 5_000)).toBe("12:05");
  });

  it("clamps negative elapsed time (clock skew) to 0:00", () => {
    const placedAt = new Date(1_000_000).toISOString();
    expect(formatElapsed(placedAt, 0)).toBe("0:00");
  });
});

describe("getElapsedSeverity", () => {
  const placedAt = new Date(0).toISOString();

  it("is normal under 10 minutes", () => {
    expect(getElapsedSeverity(placedAt, 5 * 60_000)).toBe("normal");
  });

  it("is warning between 10 and 20 minutes", () => {
    expect(getElapsedSeverity(placedAt, 15 * 60_000)).toBe("warning");
  });

  it("is critical at or beyond 20 minutes", () => {
    expect(getElapsedSeverity(placedAt, 20 * 60_000)).toBe("critical");
  });
});

describe("detectNewOrderIds", () => {
  it("returns nothing on the first observation (empty previous set)", () => {
    expect(detectNewOrderIds(new Set(), ["a", "b"])).toEqual([]);
  });

  it("returns only ids not present in the previous set", () => {
    expect(detectNewOrderIds(new Set(["a"]), ["a", "b", "c"])).toEqual(["b", "c"]);
  });

  it("returns an empty array when nothing new arrived", () => {
    expect(detectNewOrderIds(new Set(["a", "b"]), ["a", "b"])).toEqual([]);
  });
});
