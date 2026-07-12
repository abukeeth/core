import { describe, expect, it } from "vitest";
import { moveItem } from "./site-editor";

describe("moveItem", () => {
  it("swaps an item with its predecessor when moving up", () => {
    expect(moveItem(["a", "b", "c"], 1, "up")).toEqual(["b", "a", "c"]);
  });

  it("swaps an item with its successor when moving down", () => {
    expect(moveItem(["a", "b", "c"], 1, "down")).toEqual(["a", "c", "b"]);
  });

  it("is a no-op when moving the first item up", () => {
    expect(moveItem(["a", "b", "c"], 0, "up")).toEqual(["a", "b", "c"]);
  });

  it("is a no-op when moving the last item down", () => {
    expect(moveItem(["a", "b", "c"], 2, "down")).toEqual(["a", "b", "c"]);
  });

  it("returns a new array rather than mutating the input", () => {
    const original = ["a", "b", "c"];
    const result = moveItem(original, 0, "down");
    expect(result).not.toBe(original);
    expect(original).toEqual(["a", "b", "c"]);
  });
});
