import { describe, expect, it } from "vitest";
import { PaymentProviderNotImplementedError } from "../payments.errors";
import { AdyenPaymentProviderAdapter } from "./adyen.provider";
import { AuthorizeNetPaymentProviderAdapter } from "./authorize-net.provider";
import { CloverPaymentProviderAdapter } from "./clover.provider";
import { FiservPaymentProviderAdapter } from "./fiserv.provider";
import { SquarePaymentProviderAdapter } from "./square.provider";

const stubs = [
  new CloverPaymentProviderAdapter(),
  new SquarePaymentProviderAdapter(),
  new AuthorizeNetPaymentProviderAdapter(),
  new AdyenPaymentProviderAdapter(),
  new FiservPaymentProviderAdapter(),
];

describe.each(stubs)("stub payment adapter %#", (adapter) => {
  it("is marked not implemented", () => {
    expect(adapter.implemented).toBe(false);
  });

  it("every method throws PaymentProviderNotImplementedError", async () => {
    await expect(
      adapter.authorize({ orderId: "o1", amountCents: 100, currency: "usd", methodToken: "x" }, "creds"),
    ).rejects.toBeInstanceOf(PaymentProviderNotImplementedError);
    await expect(adapter.capture("pi_1", undefined, "creds")).rejects.toBeInstanceOf(
      PaymentProviderNotImplementedError,
    );
    await expect(adapter.void("pi_1", "creds")).rejects.toBeInstanceOf(PaymentProviderNotImplementedError);
    await expect(adapter.refund("pi_1", 100, "creds")).rejects.toBeInstanceOf(PaymentProviderNotImplementedError);
    await expect(adapter.getStatus("pi_1", "creds")).rejects.toBeInstanceOf(PaymentProviderNotImplementedError);
    expect(() => adapter.verifyWebhookSignature("{}", "sig", "secret")).toThrow(PaymentProviderNotImplementedError);
    expect(() => adapter.parseWebhookEvent({})).toThrow(PaymentProviderNotImplementedError);
  });
});
