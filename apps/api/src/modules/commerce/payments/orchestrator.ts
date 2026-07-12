import type { Payment, PaymentAttempt, PaymentMethodType, RefundReason } from "@prisma/client";
import { ProviderConnectionStatus } from "@prisma/client";
import { decryptSecret } from "../../../lib/encryption";
import { paymentProviderResultsTotal } from "../../../lib/metrics";
import { prisma } from "../../../lib/prisma";
import {
  NoAvailableProviderError,
  PaymentMethodNotFoundError,
  PaymentNotFoundError,
  PaymentVoidFailedError,
  RefundExceedsRemainingBalanceError,
  RefundFailedError,
} from "./payments.errors";
import { paymentProviderRegistry } from "./registry";

export interface AuthorizeOrderPaymentInput {
  orderId: string;
  restaurantId: string;
  methodType: PaymentMethodType;
  methodToken: string;
  amountCents: number;
  currency: string;
}

export interface AuthorizeOrderPaymentResult {
  payment: Payment;
  attempt: PaymentAttempt;
  /** Set when the provider requires a customer-facing 3DS/SCA challenge.
   * The caller must not proceed to captureOrderPayment or try another
   * provider — this is a customer-interaction-required state, not a
   * provider outage or decline (Sprint 07.6 C-6). */
  requiresAction?: { clientSecret: string };
}

/**
 * The core payment-orchestration entry point (Sprint 07 spec §4). Looks up
 * the enabled PaymentMethod's primary provider; if it isn't CONNECTED,
 * builds a fallback candidate list of every other CONNECTED provider for
 * the restaurant, ordered by priority (ascending, ties broken by
 * isDefault desc), and tries each in turn. One PaymentAttempt row is
 * written per try — attemptNumber counts across ALL providers tried, not
 * per-provider, per the schema's documented semantics. Never chooses a
 * provider for the customer to see; provider routing/failover is entirely
 * transparent (spec Decision #8).
 */
export async function authorizeOrderPayment(input: AuthorizeOrderPaymentInput): Promise<AuthorizeOrderPaymentResult> {
  const method = await prisma.paymentMethod.findUnique({
    where: { restaurantId_methodType: { restaurantId: input.restaurantId, methodType: input.methodType } },
    include: { provider: true },
  });
  if (!method || !method.isEnabled) {
    throw new PaymentMethodNotFoundError();
  }

  const candidates =
    method.provider.status === ProviderConnectionStatus.CONNECTED
      ? [method.provider]
      : await prisma.paymentProvider.findMany({
          where: { restaurantId: input.restaurantId, status: ProviderConnectionStatus.CONNECTED },
          orderBy: [{ priority: "asc" }, { isDefault: "desc" }],
        });

  let attemptNumber = 0;
  let lastFailure: { failureCode?: string; failureMessage?: string } | undefined;

  for (const candidate of candidates) {
    const adapter = paymentProviderRegistry.get(candidate.providerType);
    if (!adapter?.implemented || !candidate.credentialsEncrypted) {
      continue;
    }

    attemptNumber += 1;
    const credentials = decryptSecret(candidate.credentialsEncrypted);

    // Reserve the attempt row BEFORE calling the provider — if the
    // provider call succeeds but a subsequent DB write fails, this row
    // (PENDING, no providerPaymentIntentId yet) still exists to anchor a
    // reconciliation pass, rather than the authorization being left with
    // zero record anywhere in the database.
    const pendingAttempt = await prisma.paymentAttempt.create({
      data: {
        orderId: input.orderId,
        providerId: candidate.id,
        methodType: input.methodType,
        attemptNumber,
        status: "PENDING",
        amountCents: input.amountCents,
      },
    });

    const result = await adapter.authorize(
      {
        orderId: input.orderId,
        amountCents: input.amountCents,
        currency: input.currency,
        methodToken: input.methodToken,
      },
      credentials,
    );

    // Production Hardening Phase 9 — the BYOP failover orchestrator's
    // health at a glance: a provider whose failure rate climbs shows up
    // here before it shows up as a support ticket.
    paymentProviderResultsTotal.inc({
      provider: candidate.providerType,
      result: result.success ? "success" : result.requiresAction ? "requires_action" : "failure",
    });

    const attempt = await prisma.paymentAttempt.update({
      where: { id: pendingAttempt.id },
      data: {
        status: result.success ? "AUTHORIZED" : result.requiresAction ? "REQUIRES_ACTION" : "FAILED",
        providerPaymentIntentId: result.providerPaymentIntentId,
        failureCode: result.failureCode,
        failureMessage: result.failureMessage,
      },
    });

    if (result.success) {
      const payment = await prisma.payment.upsert({
        where: { orderId: input.orderId },
        create: {
          orderId: input.orderId,
          providerId: candidate.id,
          successfulAttemptId: attempt.id,
          status: "AUTHORIZED",
          authorizedAmountCents: input.amountCents,
        },
        update: {
          providerId: candidate.id,
          successfulAttemptId: attempt.id,
          status: "AUTHORIZED",
          authorizedAmountCents: input.amountCents,
        },
      });
      return { payment, attempt };
    }

    if (result.requiresAction) {
      // A 3DS/SCA challenge, not a decline — never fall through to try
      // another provider; the customer must complete this exact
      // authorization's challenge.
      const payment = await prisma.payment.upsert({
        where: { orderId: input.orderId },
        create: {
          orderId: input.orderId,
          providerId: candidate.id,
          successfulAttemptId: attempt.id,
          status: "REQUIRES_ACTION",
          authorizedAmountCents: input.amountCents,
        },
        update: {
          providerId: candidate.id,
          successfulAttemptId: attempt.id,
          status: "REQUIRES_ACTION",
          authorizedAmountCents: input.amountCents,
        },
      });
      return { payment, attempt, requiresAction: result.requiresAction };
    }

    lastFailure = { failureCode: result.failureCode, failureMessage: result.failureMessage };
  }

  if (attemptNumber === 0) {
    throw new NoAvailableProviderError();
  }
  throw new NoAvailableProviderError(lastFailure?.failureMessage);
}

/** Called right after a successful authorize for the immediate-order (auth+capture together) path. */
export async function captureOrderPayment(paymentId: string, restaurantId: string): Promise<Payment> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { provider: true } });
  if (!payment) {
    throw new PaymentNotFoundError();
  }

  const adapter = paymentProviderRegistry.get(payment.provider.providerType);
  if (!adapter || !payment.provider.credentialsEncrypted || !payment.successfulAttemptId) {
    throw new Error("Payment has no successful authorization to capture");
  }
  const attempt = await prisma.paymentAttempt.findUnique({ where: { id: payment.successfulAttemptId } });
  if (!attempt?.providerPaymentIntentId) {
    throw new Error("Payment attempt is missing a provider intent id");
  }

  const credentials = decryptSecret(payment.provider.credentialsEncrypted);
  const result = await adapter.capture(attempt.providerPaymentIntentId, undefined, credentials);
  if (!result.success) {
    // Capture failed after a successful authorize — the customer's card
    // still carries a live hold. Release it rather than leaving the
    // authorization dangling; only a genuine "void also failed" case
    // (both the capture AND the compensating void rejected) needs a
    // human to look at it.
    const voidResult = await adapter.void(attempt.providerPaymentIntentId, credentials);
    if (!voidResult.success) {
      await prisma.payment.update({ where: { id: paymentId }, data: { status: "FAILED" } });
      throw new PaymentVoidFailedError(paymentId, attempt.providerPaymentIntentId, voidResult.failureMessage);
    }
    await prisma.payment.update({ where: { id: paymentId }, data: { status: "VOIDED" } });
    throw new Error(result.failureMessage ?? "Capture failed");
  }

  const capturedAmountCents = result.capturedAmountCents ?? payment.authorizedAmountCents;
  const updated = await prisma.payment.update({
    where: { id: paymentId },
    data: { status: "CAPTURED", capturedAmountCents, capturedAt: new Date() },
  });

  await prisma.transaction.create({
    data: { orderId: payment.orderId, restaurantId, type: "CHARGE", amountCents: capturedAmountCents },
  });

  return updated;
}

export interface RefundOrderPaymentInput {
  paymentId: string;
  amountCents: number;
  reason: RefundReason;
  initiatedById?: string;
  restaurantId: string;
}

/**
 * Reserves `amountCents` of refund capacity atomically: a single
 * `UPDATE ... WHERE refundedAmountCents + $amount <= capturedAmountCents`
 * is one indivisible statement, so Postgres's own row-level locking
 * serializes two concurrent refund calls for the same payment — the
 * second one blocks until the first commits, then re-evaluates the WHERE
 * clause against the now-updated row. An empty result means the balance
 * was already (partially or fully) consumed by a concurrent refund.
 * Mirrors the same atomic-UPDATE pattern used for the DeliveryConfig/
 * KitchenCapacity singleton races — see delivery-config.service.ts.
 */
async function reserveRefundAmount(paymentId: string, amountCents: number): Promise<Payment | null> {
  const rows = await prisma.$queryRaw<Payment[]>`
    UPDATE "Payment"
    SET "refundedAmountCents" = "refundedAmountCents" + ${amountCents},
        "status" = (CASE WHEN "refundedAmountCents" + ${amountCents} >= "capturedAmountCents" THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END)::"PaymentStatus"
    WHERE "id" = ${paymentId} AND "refundedAmountCents" + ${amountCents} <= "capturedAmountCents"
    RETURNING *
  `;
  return rows[0] ?? null;
}

/** Reverses a reservation made by reserveRefundAmount when the provider call afterward fails, so the balance isn't permanently under-refundable. */
async function releaseRefundAmount(paymentId: string, amountCents: number, capturedAmountCents: number): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "Payment"
    SET "refundedAmountCents" = "refundedAmountCents" - ${amountCents},
        "status" = (CASE WHEN "refundedAmountCents" - ${amountCents} <= 0 THEN 'CAPTURED' WHEN "refundedAmountCents" - ${amountCents} >= ${capturedAmountCents} THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END)::"PaymentStatus"
    WHERE "id" = ${paymentId}
  `;
}

export async function refundOrderPayment(input: RefundOrderPaymentInput) {
  const payment = await prisma.payment.findUnique({ where: { id: input.paymentId }, include: { provider: true } });
  if (!payment) {
    throw new PaymentNotFoundError();
  }
  const adapter = paymentProviderRegistry.get(payment.provider.providerType);
  const attempt = payment.successfulAttemptId
    ? await prisma.paymentAttempt.findUnique({ where: { id: payment.successfulAttemptId } })
    : null;
  if (!adapter || !payment.provider.credentialsEncrypted || !attempt?.providerPaymentIntentId) {
    throw new PaymentNotFoundError();
  }

  // Reserve the refund capacity atomically BEFORE ever calling the
  // provider (Sprint 07.7 H-4's remaining-balance invariant, now closed
  // against concurrent refunds too — see reserveRefundAmount): two
  // concurrent refund calls for the same payment can no longer both
  // observe "enough remaining balance" and both charge the provider.
  const reserved = await reserveRefundAmount(input.paymentId, input.amountCents);
  if (!reserved) {
    throw new RefundExceedsRemainingBalanceError();
  }

  const credentials = decryptSecret(payment.provider.credentialsEncrypted);
  const result = await adapter.refund(attempt.providerPaymentIntentId, input.amountCents, credentials);

  if (!result.success) {
    // The reservation already moved refundedAmountCents/status forward;
    // since the provider never actually moved money, release it back so
    // the balance isn't permanently (and incorrectly) under-refundable.
    await releaseRefundAmount(input.paymentId, input.amountCents, payment.capturedAmountCents);
  }

  // The Refund row is written regardless of outcome — a FAILED attempt
  // must still be auditable — but a failed refund is ALWAYS surfaced as
  // an exception. Callers must never be able to treat a rejected refund
  // as if money had moved.
  const refund = await prisma.refund.create({
    data: {
      paymentId: payment.id,
      orderId: payment.orderId,
      amountCents: input.amountCents,
      reason: input.reason,
      status: result.success ? "COMPLETED" : "FAILED",
      providerRefundId: result.providerRefundId,
      initiatedById: input.initiatedById,
    },
  });

  if (!result.success) {
    throw new RefundFailedError(result.failureMessage);
  }

  await prisma.transaction.create({
    data: {
      orderId: payment.orderId,
      restaurantId: input.restaurantId,
      type: "REFUND",
      amountCents: -input.amountCents,
    },
  });

  return refund;
}
