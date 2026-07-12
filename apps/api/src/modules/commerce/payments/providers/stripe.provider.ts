import { PaymentProviderType } from "@prisma/client";
import Stripe from "stripe";
import type {
  AuthorizeInput,
  AuthorizeResult,
  CaptureResult,
  NormalizedWebhookEvent,
  PaymentProviderAdapter,
  ProviderPaymentStatus,
  RefundResult,
  VoidResult,
} from "../types";

/**
 * Real Stripe implementation of PaymentProviderAdapter — Sprint 07's
 * "Stripe-first" decision (spec §4, Decisions Requiring Approval #1).
 *
 * BYOP: every method receives the restaurant's own (already-decrypted)
 * Stripe secret key as `credentials` and constructs a fresh `Stripe`
 * client per call. Clients are deliberately never cached across
 * restaurants/calls — caching would risk one restaurant's client being
 * reused with another's key if a caching key were ever computed wrong,
 * and Stripe client construction is cheap (no network call).
 *
 * Design choice — manual capture: `authorize()` creates a PaymentIntent
 * with `capture_method: "manual"` and confirms it immediately using the
 * supplied `methodToken` as the PaymentMethod. This intentionally
 * separates authorization from capture so checkout's "auth now,
 * capture-on-confirmation" scheduled-order mode (spec §4) and the
 * immediate-order "auth+capture together" mode can both be built on top
 * of the same two-step primitive — the orchestrator's
 * `captureOrderPayment` simply calls capture right away for the
 * immediate-order case rather than this adapter needing two code paths.
 */
export class StripePaymentProviderAdapter implements PaymentProviderAdapter {
  readonly providerType = PaymentProviderType.STRIPE;
  readonly implemented = true;

  private client(credentials: string): Stripe {
    return new Stripe(credentials);
  }

  async authorize(input: AuthorizeInput, credentials: string): Promise<AuthorizeResult> {
    const stripe = this.client(credentials);
    try {
      const intent = await stripe.paymentIntents.create({
        amount: input.amountCents,
        currency: input.currency,
        payment_method: input.methodToken,
        payment_method_types: ["card"],
        capture_method: "manual",
        confirm: true,
        metadata: { orderId: input.orderId },
      });

      if (intent.status === "requires_capture" || intent.status === "succeeded") {
        return { success: true, providerPaymentIntentId: intent.id };
      }

      if (intent.status === "requires_action" && intent.client_secret) {
        return {
          success: false,
          providerPaymentIntentId: intent.id,
          requiresAction: { clientSecret: intent.client_secret },
        };
      }

      return {
        success: false,
        providerPaymentIntentId: intent.id,
        failureCode: intent.last_payment_error?.code,
        failureMessage: intent.last_payment_error?.message ?? `Unexpected PaymentIntent status: ${intent.status}`,
      };
    } catch (err) {
      if (err instanceof Stripe.errors.StripeError) {
        return {
          success: false,
          providerPaymentIntentId:
            typeof err.payment_intent === "object" && err.payment_intent !== null
              ? (err.payment_intent as { id?: string }).id
              : undefined,
          failureCode: err.code ?? err.decline_code,
          failureMessage: err.message,
        };
      }
      throw err;
    }
  }

  async capture(
    providerPaymentIntentId: string,
    amountCents: number | undefined,
    credentials: string,
  ): Promise<CaptureResult> {
    const stripe = this.client(credentials);
    try {
      const intent = await stripe.paymentIntents.capture(
        providerPaymentIntentId,
        amountCents !== undefined ? { amount_to_capture: amountCents } : undefined,
      );
      if (intent.status !== "succeeded") {
        return { success: false, failureMessage: `Unexpected PaymentIntent status after capture: ${intent.status}` };
      }
      return { success: true, capturedAmountCents: intent.amount_received };
    } catch (err) {
      if (err instanceof Stripe.errors.StripeError) {
        return { success: false, failureMessage: err.message };
      }
      throw err;
    }
  }

  async void(providerPaymentIntentId: string, credentials: string): Promise<VoidResult> {
    const stripe = this.client(credentials);
    try {
      const intent = await stripe.paymentIntents.cancel(providerPaymentIntentId);
      if (intent.status !== "canceled") {
        return { success: false, failureMessage: `Unexpected PaymentIntent status after cancel: ${intent.status}` };
      }
      return { success: true };
    } catch (err) {
      if (err instanceof Stripe.errors.StripeError) {
        return { success: false, failureMessage: err.message };
      }
      throw err;
    }
  }

  async refund(providerPaymentIntentId: string, amountCents: number, credentials: string): Promise<RefundResult> {
    const stripe = this.client(credentials);
    try {
      const refund = await stripe.refunds.create({
        payment_intent: providerPaymentIntentId,
        amount: amountCents,
      });
      if (refund.status === "failed") {
        return { success: false, failureMessage: refund.failure_reason ?? "Refund failed" };
      }
      return { success: true, providerRefundId: refund.id };
    } catch (err) {
      if (err instanceof Stripe.errors.StripeError) {
        return { success: false, failureMessage: err.message };
      }
      throw err;
    }
  }

  async getStatus(providerPaymentIntentId: string, credentials: string): Promise<ProviderPaymentStatus> {
    const stripe = this.client(credentials);
    const intent = await stripe.paymentIntents.retrieve(providerPaymentIntentId);
    return mapIntentStatus(intent.status);
  }

  /**
   * A Stripe client needs *a* key to construct even though
   * `webhooks.constructEvent` never makes a network call and never uses
   * that key — it only HMACs the raw body against `webhookSecret`. Reusing
   * the restaurant's own (decrypted) BYOP credentials here is safe (it's
   * already this restaurant's own secret) and avoids introducing a second,
   * separate "dummy key" concept.
   */
  verifyWebhookSignature(rawBody: string, signatureHeader: string, webhookSecret: string): boolean {
    try {
      Stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
      return true;
    } catch {
      return false;
    }
  }

  parseWebhookEvent(payload: unknown): NormalizedWebhookEvent {
    const event = payload as Stripe.Event;
    const object = event.data.object as { id: string; status?: string };

    switch (event.type) {
      case "payment_intent.payment_failed": {
        return { externalEventId: event.id, providerPaymentIntentId: object.id, status: "failed", raw: payload };
      }
      case "payment_intent.canceled": {
        return { externalEventId: event.id, providerPaymentIntentId: object.id, status: "voided", raw: payload };
      }
      case "payment_intent.amount_capturable_updated": {
        return { externalEventId: event.id, providerPaymentIntentId: object.id, status: "authorized", raw: payload };
      }
      case "payment_intent.succeeded": {
        return { externalEventId: event.id, providerPaymentIntentId: object.id, status: "captured", raw: payload };
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const fullyRefunded = charge.amount_refunded >= charge.amount;
        return {
          externalEventId: event.id,
          providerPaymentIntentId:
            typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id,
          status: fullyRefunded ? "refunded" : "partially_refunded",
          raw: payload,
        };
      }
      default: {
        const status = mapIntentStatus(object.status as Stripe.PaymentIntent.Status | undefined);
        return { externalEventId: event.id, providerPaymentIntentId: object.id, status, raw: payload };
      }
    }
  }
}

function mapIntentStatus(status: Stripe.PaymentIntent.Status | undefined): ProviderPaymentStatus {
  switch (status) {
    case "succeeded":
      return "captured";
    case "requires_capture":
      return "authorized";
    case "canceled":
      return "voided";
    case "requires_payment_method":
      return "failed";
    case "processing":
    case "requires_action":
    case "requires_confirmation":
      return "pending";
    default:
      return "pending";
  }
}
