import Stripe from "stripe";
import type { PlatformSubscription, PlatformSubscriptionStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { getEnv, getOptionalEnv } from "../../config/env";
import { createLogger } from "../../lib/logger";

const logger = createLogger("billing");
import { getOwnRestaurantId } from "../restaurants/restaurant.service";
import { NoRestaurantError } from "../restaurants/restaurant.errors";
import { BillingNotConfiguredError, BillingPortalUnavailableError } from "./billing.errors";
import {
  ensureSubscription,
  evaluateSubscription,
  isBillingEnforcementEnabled,
  type Entitlement,
} from "./entitlements";

export function isBillingConfigured(): boolean {
  return Boolean(getOptionalEnv("PLATFORM_STRIPE_SECRET_KEY") && getOptionalEnv("PLATFORM_STRIPE_PRICE_ID"));
}

/**
 * The PLATFORM's own Stripe account (charging business owners) — entirely
 * separate from the BYOP PaymentProvider adapters, which run on each
 * restaurant's own Stripe credentials to charge their diners.
 */
function stripeClient(): Stripe {
  const key = getOptionalEnv("PLATFORM_STRIPE_SECRET_KEY");
  if (!key) throw new BillingNotConfiguredError();
  return new Stripe(key);
}

export interface BillingSummary {
  plan: PlatformSubscription["plan"];
  status: PlatformSubscriptionStatus;
  state: Entitlement["state"];
  entitled: boolean;
  enforcementEnabled: boolean;
  configured: boolean;
  trialEndsAt: string;
  trialDaysLeft: number | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasStripeSubscription: boolean;
}

async function requireOwnRestaurantId(userId: string): Promise<string> {
  const restaurantId = await getOwnRestaurantId(userId);
  if (!restaurantId) throw new NoRestaurantError();
  return restaurantId;
}

export async function getBillingSummary(userId: string): Promise<BillingSummary> {
  const restaurantId = await requireOwnRestaurantId(userId);
  const sub = await ensureSubscription(restaurantId);
  const entitlement = evaluateSubscription(sub);
  return {
    plan: sub.plan,
    status: sub.status,
    state: entitlement.state,
    entitled: entitlement.entitled,
    enforcementEnabled: isBillingEnforcementEnabled(),
    configured: isBillingConfigured(),
    trialEndsAt: sub.trialEndsAt.toISOString(),
    trialDaysLeft: entitlement.trialDaysLeft,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    hasStripeSubscription: Boolean(sub.stripeSubscriptionId),
  };
}

/** Stripe Checkout in subscription mode — the ONLY way a paid plan starts. */
export async function createCheckoutSession(userId: string): Promise<{ url: string }> {
  const restaurantId = await requireOwnRestaurantId(userId);
  const priceId = getOptionalEnv("PLATFORM_STRIPE_PRICE_ID");
  if (!priceId) throw new BillingNotConfiguredError();
  const stripe = stripeClient();

  const [sub, owner] = await Promise.all([
    ensureSubscription(restaurantId),
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
  ]);

  const returnBase = `${getEnv().FRONTEND_URL}/dashboard/billing`;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    // Resume an existing Stripe customer if one exists so a lapsed owner
    // re-subscribing doesn't fork a duplicate customer record.
    ...(sub.stripeCustomerId ? { customer: sub.stripeCustomerId } : { customer_email: owner?.email }),
    client_reference_id: restaurantId,
    subscription_data: { metadata: { restaurantId } },
    metadata: { restaurantId },
    success_url: `${returnBase}?checkout=success`,
    cancel_url: `${returnBase}?checkout=canceled`,
    allow_promotion_codes: true,
  });
  if (!session.url) throw new Error("Stripe did not return a Checkout URL");
  return { url: session.url };
}

/** Stripe customer portal — plan changes, card updates, cancellation, invoices. */
export async function createPortalSession(userId: string): Promise<{ url: string }> {
  const restaurantId = await requireOwnRestaurantId(userId);
  const sub = await ensureSubscription(restaurantId);
  if (!sub.stripeCustomerId) throw new BillingPortalUnavailableError();
  const stripe = stripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${getEnv().FRONTEND_URL}/dashboard/billing`,
  });
  return { url: session.url };
}

function mapStripeSubscriptionStatus(stripeStatus: Stripe.Subscription.Status): PlatformSubscriptionStatus {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    default:
      // canceled, incomplete, incomplete_expired, paused — no entitlement.
      return "CANCELED";
  }
}

/** `current_period_end` lives on the subscription in older API versions and on its items in newer ones — read both. */
function periodEndOf(sub: Stripe.Subscription): Date | null {
  const raw =
    (sub as unknown as { current_period_end?: number }).current_period_end ??
    sub.items?.data?.[0]?.current_period_end;
  return typeof raw === "number" ? new Date(raw * 1000) : null;
}

export type BillingWebhookOutcome = "processed" | "ignored" | "invalid_signature" | "unmatched";

/**
 * Platform Stripe webhook — the single writer that mirrors Stripe Billing
 * state into PlatformSubscription. Signature-verified against the exact
 * raw bytes Stripe signed.
 */
export async function handleBillingWebhook(rawBody: string, signatureHeader: string): Promise<BillingWebhookOutcome> {
  const webhookSecret = getOptionalEnv("PLATFORM_STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) throw new BillingNotConfiguredError();

  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
  } catch {
    return "invalid_signature";
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const restaurantId = session.metadata?.restaurantId ?? session.client_reference_id;
      if (!restaurantId) return "unmatched";
      const stripeSubscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      const stripeCustomerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      await prisma.platformSubscription.update({
        where: { restaurantId },
        data: { status: "ACTIVE", stripeSubscriptionId, stripeCustomerId },
      });
      logger.info({ restaurantId }, "billing: checkout completed — subscription active");
      return "processed";
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object;
      const restaurantId = sub.metadata?.restaurantId;
      const where = restaurantId ? { restaurantId } : { stripeSubscriptionId: sub.id };
      const existing = await prisma.platformSubscription.findUnique({ where });
      if (!existing) return "unmatched";
      await prisma.platformSubscription.update({
        where: { id: existing.id },
        data: {
          status: mapStripeSubscriptionStatus(sub.status),
          stripeSubscriptionId: sub.id,
          stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
          currentPeriodEnd: periodEndOf(sub),
          cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
        },
      });
      return "processed";
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object;
      const existing = await prisma.platformSubscription.findUnique({ where: { stripeSubscriptionId: sub.id } });
      if (!existing) return "unmatched";
      await prisma.platformSubscription.update({ where: { id: existing.id }, data: { status: "CANCELED" } });
      return "processed";
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (!customerId) return "unmatched";
      const existing = await prisma.platformSubscription.findUnique({ where: { stripeCustomerId: customerId } });
      if (!existing) return "unmatched";
      // Only demote an entitled state — a CANCELED sub stays canceled.
      if (existing.status === "ACTIVE" || existing.status === "TRIALING") {
        await prisma.platformSubscription.update({ where: { id: existing.id }, data: { status: "PAST_DUE" } });
      }
      return "processed";
    }

    default:
      return "ignored";
  }
}
