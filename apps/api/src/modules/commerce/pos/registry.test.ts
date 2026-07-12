import { describe, expect, it } from "vitest";
import { posProviderRegistry } from "./registry";

describe("posProviderRegistry", () => {
  it("registers all five POS providers as stubs (implemented: false)", () => {
    for (const type of ["SQUARE_POS", "CLOVER_POS", "TOAST", "LIGHTSPEED", "GENERIC"] as const) {
      expect(posProviderRegistry.get(type)?.implemented).toBe(false);
    }
  });
});
