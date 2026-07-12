/**
 * Typed errors for the payments module, mirroring the shape of
 * modules/imports/import.errors.ts and modules/menu/menu.errors.ts —
 * thrown by services, mapped to HTTP status codes by controllers.
 */

export class PaymentProviderNotFoundError extends Error {
  constructor() {
    super("Payment provider not found");
  }
}

export class PaymentProviderNotImplementedError extends Error {
  constructor(providerType: string) {
    super(`Payment provider "${providerType}" is not implemented yet`);
  }
}

export class PaymentMethodNotFoundError extends Error {
  constructor() {
    super("Payment method not found or not enabled");
  }
}

/**
 * Thrown by the orchestrator when the primary provider for a payment
 * method is unavailable and every fallback candidate (or no candidate at
 * all) also fails to authorize — the customer-facing "payment temporarily
 * unavailable" case from Sprint 07 spec §4.
 */
export class NoAvailableProviderError extends Error {
  constructor(detail?: string) {
    super(
      detail
        ? `No available payment provider could authorize this payment: ${detail}`
        : "No available payment provider could authorize this payment",
    );
  }
}

export class PaymentNotFoundError extends Error {
  constructor() {
    super("Payment not found");
  }
}

/**
 * Thrown when a capture fails AND the compensating void attempt also
 * fails — the one case in the orchestrator that genuinely needs a human:
 * the customer's card may still carry an unresolved authorization hold.
 * Distinct from a plain capture failure (which is cleanly voided and
 * requires no follow-up) so this can be found/alerted on separately.
 */
export class PaymentVoidFailedError extends Error {
  constructor(
    public readonly paymentId: string,
    public readonly providerPaymentIntentId: string,
    detail?: string,
  ) {
    super(
      detail
        ? `Capture failed and the compensating void also failed — the authorization on ${providerPaymentIntentId} is unresolved: ${detail}`
        : `Capture failed and the compensating void also failed — the authorization on ${providerPaymentIntentId} is unresolved`,
    );
  }
}

/**
 * Thrown when a refund is rejected by the provider — refundOrderPayment
 * never silently returns a FAILED Refund row; a failed refund is always
 * an exception, so callers can never mistake it for a successful one.
 */
export class RefundFailedError extends Error {
  constructor(detail?: string) {
    super(detail ? `Refund failed: ${detail}` : "Refund failed");
  }
}

/**
 * Thrown when a refund request exceeds the payment's remaining
 * refundable balance — enforced at the application layer rather than
 * relying solely on the provider to reject an over-refund.
 */
export class RefundExceedsRemainingBalanceError extends Error {
  constructor() {
    super("This refund amount exceeds the amount still available to refund on this payment");
  }
}
