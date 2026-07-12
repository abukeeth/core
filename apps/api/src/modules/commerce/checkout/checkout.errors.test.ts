import { describe, expect, it } from "vitest";
import { PaymentFailedError } from "./checkout.errors";

describe("PaymentFailedError (Sprint 07.7 H-3)", () => {
  it("defaults publicMessage sensibly when no category is specified", () => {
    const err = new PaymentFailedError("some raw internal detail");
    expect(err.publicMessage).toBe("Payment failed. Please try again or use a different payment method.");
  });

  it("keeps the raw detail on message (for server-side logging) while publicMessage stays generic", () => {
    const rawDetail = "card_declined: insufficient_funds (pi_123abc)";
    const err = new PaymentFailedError(rawDetail, "declined_or_unavailable");

    expect(err.message).toContain(rawDetail);
    expect(err.publicMessage).not.toContain(rawDetail);
    expect(err.publicMessage).not.toContain("pi_123abc");
  });

  it("maps each category to a distinct, fixed, generic public message", () => {
    const categories = ["declined_or_unavailable", "invalid_method", "method_token_required", "generic"] as const;
    const messages = categories.map((category) => new PaymentFailedError("detail", category).publicMessage);

    expect(new Set(messages).size).toBe(categories.length);
    for (const message of messages) {
      expect(message).not.toContain("detail");
    }
  });
});
