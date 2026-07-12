import { Prisma } from "@prisma/client";
import { decryptSecret } from "../../../lib/encryption";
import { prisma } from "../../../lib/prisma";
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
 * the normalized event. Does NOT touch Order state — that's the orders
 * module's responsibility (via its own subscription/poll), out of scope
 * for this module.
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
