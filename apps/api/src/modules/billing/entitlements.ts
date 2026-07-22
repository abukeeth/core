import type { PlatformSubscription } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { getBooleanEnv, getNumberEnv } from "../../config/env";
import { SubscriptionInactiveError } from "./billing.errors";

const DAY_MS = 24 * 60 * 60 * 1000;

export function trialLengthDays(): number {
  return getNumberEnv("BILLING_TRIAL_DAYS", 14);
}

/**
 * Master enforcement switch. Off (the default) means billing is
 * bookkeeping only: subscriptions exist, the dashboard shows trial state,
 * but nothing is ever blocked — so deploying billing cannot take down a
 * single storefront until this is deliberately flipped on.
 */
export function isBillingEnforcementEnabled(): boolean {
  return getBooleanEnv("BILLING_ENFORCEMENT_ENABLED", false);
}

/**
 * TRIAL_EXPIRED is derived (TRIALING + trialEndsAt in the past), never
 * stored — correctness doesn't depend on a cron flipping rows.
 */
export type EntitlementState = "TRIALING" | "TRIAL_EXPIRED" | "ACTIVE" | "PAST_DUE" | "CANCELED";

export interface Entitlement {
  state: EntitlementState;
  /** May this business publish and take new orders (ignoring the enforcement flag)? */
  entitled: boolean;
  /** Whole days of trial remaining (ceil); null once a paid subscription exists or the trial is over. */
  trialDaysLeft: number | null;
}

export function evaluateSubscription(sub: PlatformSubscription, now: Date = new Date()): Entitlement {
  switch (sub.status) {
    case "ACTIVE":
      return { state: "ACTIVE", entitled: true, trialDaysLeft: null };
    case "PAST_DUE":
      // Stripe retries failed invoices for days — killing the storefront on
      // the first failed charge punishes the owner's customers for a card
      // hiccup. PAST_DUE stays entitled; Stripe moves it to canceled/unpaid
      // (→ CANCELED here) if dunning ultimately fails.
      return { state: "PAST_DUE", entitled: true, trialDaysLeft: null };
    case "CANCELED":
      return { state: "CANCELED", entitled: false, trialDaysLeft: null };
    case "TRIALING": {
      const msLeft = sub.trialEndsAt.getTime() - now.getTime();
      if (msLeft <= 0) {
        return { state: "TRIAL_EXPIRED", entitled: false, trialDaysLeft: 0 };
      }
      return { state: "TRIALING", entitled: true, trialDaysLeft: Math.ceil(msLeft / DAY_MS) };
    }
  }
}

/**
 * Every Business is supposed to get its subscription row at creation time
 * (restaurant.service.ts transaction) or from the ship migration's
 * backfill — this get-or-create is the safety net that makes entitlement
 * checks total anyway (e.g. a restaurant created while a pre-billing API
 * instance was still draining).
 */
export async function ensureSubscription(restaurantId: string): Promise<PlatformSubscription> {
  const existing = await prisma.platformSubscription.findUnique({ where: { restaurantId } });
  if (existing) return existing;
  return prisma.platformSubscription.upsert({
    where: { restaurantId },
    create: { restaurantId, trialEndsAt: new Date(Date.now() + trialLengthDays() * DAY_MS) },
    update: {},
  });
}

export async function getEntitlement(restaurantId: string): Promise<Entitlement> {
  return evaluateSubscription(await ensureSubscription(restaurantId));
}

/**
 * The gate used at billable actions (site publish, new-order placement).
 * A no-op while enforcement is off.
 */
export async function assertEntitled(restaurantId: string): Promise<void> {
  if (!isBillingEnforcementEnabled()) return;
  const entitlement = await getEntitlement(restaurantId);
  if (!entitlement.entitled) {
    throw new SubscriptionInactiveError(entitlement.state);
  }
}
