import { describe, expect, it } from "vitest";
import { paymentProviderRegistry } from "./registry";

describe("paymentProviderRegistry", () => {
  it("registers Stripe as implemented and every other provider as a stub", () => {
    expect(paymentProviderRegistry.get("STRIPE")?.implemented).toBe(true);
    for (const type of ["CLOVER", "SQUARE", "AUTHORIZE_NET", "ADYEN", "FISERV"] as const) {
      expect(paymentProviderRegistry.get(type)?.implemented).toBe(false);
    }
  });
});
