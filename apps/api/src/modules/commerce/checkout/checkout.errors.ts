export class CheckoutIneligibleError extends Error {
  constructor(reason: string) {
    super(reason);
  }
}

export class EmptyCartError extends Error {
  constructor() {
    super("Cannot check out an empty cart");
  }
}

export class PriceDriftError extends Error {
  constructor() {
    super("One or more item prices have changed since you added them — please review your cart");
  }
}

export class ItemUnavailableAtCheckoutError extends Error {
  constructor(itemName: string) {
    super(`"${itemName}" is no longer available`);
  }
}

/**
 * Categorizes a payment failure into a small, fixed set of safe, generic
 * public-facing messages (Sprint 07.7 H-3) — never the raw provider
 * message. A raw provider decline string (e.g. Stripe's own error text)
 * can be used by an attacker as a card-testing oracle if echoed back
 * verbatim to an unauthenticated checkout client, so it must never reach
 * `publicMessage`; it stays available only via `message`/`detail` for
 * server-side logs.
 */
export type PaymentFailureCategory = "declined_or_unavailable" | "invalid_method" | "method_token_required" | "generic";

const PUBLIC_MESSAGES: Record<PaymentFailureCategory, string> = {
  declined_or_unavailable: "Your card was declined or this payment method could not be processed. Please try again or use a different payment method.",
  invalid_method: "This payment method is not available for this restaurant. Please choose a different payment method.",
  method_token_required: "A payment method is required for this method type",
  generic: "Payment failed. Please try again or use a different payment method.",
};

export class PaymentFailedError extends Error {
  /** Safe, generic text for an unauthenticated client response — never the raw provider detail. */
  public readonly publicMessage: string;

  constructor(detail?: string, category: PaymentFailureCategory = "generic") {
    super(detail ? `Payment failed: ${detail}` : "Payment failed");
    this.publicMessage = PUBLIC_MESSAGES[category];
  }
}

export class CheckoutInProgressError extends Error {
  constructor() {
    super("This checkout request is already being processed");
  }
}

export class GuestInfoRequiredError extends Error {
  constructor() {
    super("Guest checkout requires an email and name");
  }
}
