/**
 * Typed errors for the platform billing module, mirroring
 * modules/commerce/payments/payments.errors.ts — thrown by services,
 * mapped to HTTP status codes by the controller.
 */

/** PLATFORM_STRIPE_SECRET_KEY (and friends) not set — billing endpoints are inert, never a boot failure. */
export class BillingNotConfiguredError extends Error {
  constructor() {
    super("Billing is not configured on this deployment yet");
  }
}

/** Portal needs an existing Stripe customer — the owner has never completed Checkout. */
export class BillingPortalUnavailableError extends Error {
  constructor() {
    super("No billing account yet — subscribe first to manage billing");
  }
}

/**
 * Thrown by assertEntitled() at gated actions (publishing, taking new
 * orders) when enforcement is on and neither an active subscription nor a
 * live trial covers the business.
 */
export class SubscriptionInactiveError extends Error {
  constructor(readonly state: string) {
    super("Subscription inactive — the free trial has ended and no active plan is in place");
  }
}
