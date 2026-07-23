import { describe, expect, it } from "vitest";
import { fulfillmentProviderRegistry, isFulfillmentMethodAvailable } from "./registry";

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

describe("isFulfillmentMethodAvailable", () => {
  it("always allows the internal methods (PICKUP, RESTAURANT_DRIVER)", () => {
    expect(isFulfillmentMethodAvailable("PICKUP")).toBe(true);
    expect(isFulfillmentMethodAvailable("RESTAURANT_DRIVER")).toBe(true);
  });

  it("blocks external methods whose adapter is still a stub (implemented: false)", () => {
    expect(isFulfillmentMethodAvailable("UBER_DIRECT")).toBe(false);
    expect(isFulfillmentMethodAvailable("DOORDASH_DRIVE")).toBe(false);
    expect(isFulfillmentMethodAvailable("LOCAL_COURIER")).toBe(false);
    // When these adapters ship (implemented: true), this helper re-enables them
    // automatically — nothing in delivery-rule validation needs to change.
  });
});
