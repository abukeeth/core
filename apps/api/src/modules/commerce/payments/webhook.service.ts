import { Prisma } from "@prisma/client";
import { decryptSecret } from "../../../lib/encryption";
import { prisma } from "../../../lib/prisma";
import { canTransitionOrderStatus } from "../orders/order-state-machine";
import { PaymentProviderNotFoundError } from "./payments.errors";
import { paymentProviderRegistry } from "./registry";

export interface HandleWebhookInput {
  providerId: string;
  rawBody: string;
  signatureHeader: string;
  parsedPayload: unknown;
}

export type WebhookOutcome =
  | { status: "processed" }
  | { status: "duplicate" }
  | { status: "invalid_signature" }
  | { status: "provider_not_found" };

/**
 * Verifies signature, writes the idempotent WebhookEvent row (unique on
 * [source, externalEventId] — a P2002 conflict means "already processed,
 * no-op, still 200 OK"), and updates PaymentAttempt/Payment status from
 * the normalized event. For the synchronous checkout path, Order state is
 * owned by the orders/checkout module (authorize/capture set it inline), so
 * this handler deliberately does NOT reconcile authorized/captured back onto
 * the Order — echoing them could regress a PAID order to AUTHORIZED on a
 * late/out-of-order webhook. It DOES reconcile the one class of money event
 * that only ever arrives asynchronously: an externally-initiated refund
 * (Stripe-dashboard refund or a dispute), which otherwise leaves the Order
 * showing PAID while the money has actually been returned.
 */
export async function handlePaymentWebhook(input: HandleWebhookInput): Promise<WebhookOutcome> {
  const provider = await prisma.paymentProvider.findUnique({ where: { id: input.providerId } });
  if (!provider) {
    return { status: "provider_not_found" };
  }

  const adapter = paymentProviderRegistry.get(provider.providerType);
  if (!adapter || !provider.webhookSecretEncrypted) {
    return { status: "provider_not_found" };
  }

  const webhookSecret = decryptSecret(provider.webhookSecretEncrypted);
  const signatureValid = adapter.verifyWebhookSignature(input.rawBody, input.signatureHeader, webhookSecret);
  if (!signatureValid) {
    return { status: "invalid_signature" };
  }

  const normalized = adapter.parseWebhookEvent(input.parsedPayload);
  const source = provider.providerType.toLowerCase();

  try {
    await prisma.webhookEvent.create({
      data: {
        source,
        externalEventId: normalized.externalEventId,
        payload: input.parsedPayload as Prisma.InputJsonValue,
        signatureVerified: true,
        status: "PROCESSED",
        processedAt: new Date(),
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { status: "duplicate" };
    }
    throw err;
  }

  if (normalized.providerPaymentIntentId) {
    await applyPaymentStatus(normalized.providerPaymentIntentId, normalized.status);
  }

  return { status: "processed" };
}

async function applyPaymentStatus(providerPaymentIntentId: string, status: string): Promise<void> {
  const attempt = await prisma.paymentAttempt.findFirst({ where: { providerPaymentIntentId } });
  if (!attempt) return;

  const attemptStatus = mapToAttemptStatus(status);
  if (attemptStatus) {
    await prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: attemptStatus } });
  }

  const payment = await prisma.payment.findUnique({ where: { orderId: attempt.orderId } });
  if (!payment || payment.successfulAttemptId !== attempt.id) return;

  const paymentStatus = mapToPaymentStatus(status);
  if (paymentStatus) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: paymentStatus } });
  }

  // Reconcile the Order for externally-initiated refunds only. The
  // synchronous checkout path never produces these, so there is no race
  // with authorize/capture; a refund/dispute is the realistic async-only
  // money event that would otherwise leave Order.paymentStatus stale.
  if (status === "refunded" || status === "partially_refunded") {
    await reconcileOrderRefund(attempt.orderId, status === "refunded");
  }
}

/**
 * Mirrors the in-app refundOrder outcome (orders.service.ts) for a refund that
 * was initiated outside the app: a full refund moves paymentStatus → REFUNDED
 * and, when the fulfillment state machine allows it, status → REFUNDED; a
 * partial refund moves paymentStatus → PARTIALLY_REFUNDED without ever
 * downgrading an already-full refund.
 */
async function reconcileOrderRefund(orderId: string, isFullRefund: boolean): Promise<void> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return;

  if (!isFullRefund) {
    if (order.paymentStatus === "REFUNDED") return;
    await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "PARTIALLY_REFUNDED" } });
    return;
  }

  const data: Prisma.OrderUpdateInput = { paymentStatus: "REFUNDED" };
  if (order.status !== "REFUNDED" && canTransitionOrderStatus(order.status, "REFUNDED")) {
    data.status = "REFUNDED";
  }
  await prisma.order.update({ where: { id: order.id }, data });
}

function mapToAttemptStatus(status: string) {
  switch (status) {
    case "authorized":
      return "AUTHORIZED" as const;
    case "captured":
      return "CAPTURED" as const;
    case "failed":
      return "FAILED" as const;
    case "voided":
      return "VOIDED" as const;
    default:
      return undefined;
  }
}

function mapToPaymentStatus(status: string) {
  switch (status) {
    case "authorized":
      return "AUTHORIZED" as const;
    case "captured":
      return "CAPTURED" as const;
    case "failed":
      return "FAILED" as const;
    case "voided":
      return "VOIDED" as const;
    case "refunded":
      return "REFUNDED" as const;
    case "partially_refunded":
      return "PARTIALLY_REFUNDED" as const;
    default:
      return undefined;
  }
}

export { PaymentProviderNotFoundError };
