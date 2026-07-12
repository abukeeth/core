import { describe, expect, it } from "vitest";
import { fulfillmentProviderRegistry } from "./registry";

describe("fulfillmentProviderRegistry", () => {
  it("registers all three BYO-delivery providers as stubs (implemented: false)", () => {
    for (const type of ["UBER_DIRECT", "DOORDASH_DRIVE", "LOCAL_COURIER"] as const) {
      expect(fulfillmentProviderRegistry.get(type)?.implemented).toBe(false);
    }
  });

  it("has no adapter registered for PICKUP/RESTAURANT_DRIVER (internal flows, not external providers)", () => {
    expect(fulfillmentProviderRegistry.get("PICKUP" as never)).toBeUndefined();
    expect(fulfillmentProviderRegistry.get("RESTAURANT_DRIVER" as never)).toBeUndefined();
  });
});
