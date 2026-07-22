import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformSubscription } from "@prisma/client";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    platformSubscription: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from "../../lib/prisma";
import { SubscriptionInactiveError } from "./billing.errors";
import { assertEntitled, ensureSubscription, evaluateSubscription, trialLengthDays } from "./entitlements";

const NOW = new Date("2026-07-22T12:00:00Z");

function sub(overrides: Partial<PlatformSubscription> = {}): PlatformSubscription {
  return {
    id: "ps-1",
    restaurantId: "r-1",
    plan: "STARTER",
    status: "TRIALING",
    trialEndsAt: new Date("2026-08-01T12:00:00Z"),
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.BILLING_ENFORCEMENT_ENABLED;
  delete process.env.BILLING_TRIAL_DAYS;
});

afterEach(() => {
  delete process.env.BILLING_ENFORCEMENT_ENABLED;
  delete process.env.BILLING_TRIAL_DAYS;
});

describe("evaluateSubscription — entitlement is derived, never cron-flipped", () => {
  it("a live trial is entitled with the remaining days counted (ceil)", () => {
    const result = evaluateSubscription(sub(), NOW);
    expect(result).toEqual({ state: "TRIALING", entitled: true, trialDaysLeft: 10 });
  });

  it("a lapsed trial is TRIAL_EXPIRED and not entitled — without any stored status change", () => {
    const result = evaluateSubscription(sub({ trialEndsAt: new Date("2026-07-22T11:59:59Z") }), NOW);
    expect(result).toEqual({ state: "TRIAL_EXPIRED", entitled: false, trialDaysLeft: 0 });
  });

  it("ACTIVE is entitled", () => {
    expect(evaluateSubscription(sub({ status: "ACTIVE" }), NOW).entitled).toBe(true);
  });

  it("PAST_DUE stays entitled (Stripe dunning grace) but reports its state honestly", () => {
    const result = evaluateSubscription(sub({ status: "PAST_DUE" }), NOW);
    expect(result.entitled).toBe(true);
    expect(result.state).toBe("PAST_DUE");
  });

  it("CANCELED is not entitled", () => {
    expect(evaluateSubscription(sub({ status: "CANCELED" }), NOW).entitled).toBe(false);
  });
});

describe("assertEntitled — the billable-action gate", () => {
  it("is a NO-OP while enforcement is off (the default), even for a lapsed trial", async () => {
    vi.mocked(prisma.platformSubscription.findUnique).mockResolvedValue(sub({ trialEndsAt: new Date("2020-01-01") }));
    await expect(assertEntitled("r-1")).resolves.toBeUndefined();
    // The gate never even had to look the subscription up.
    expect(prisma.platformSubscription.findUnique).not.toHaveBeenCalled();
  });

  it("throws SubscriptionInactiveError for a lapsed trial when enforcement is on", async () => {
    process.env.BILLING_ENFORCEMENT_ENABLED = "true";
    vi.mocked(prisma.platformSubscription.findUnique).mockResolvedValue(sub({ trialEndsAt: new Date("2020-01-01") }));
    await expect(assertEntitled("r-1")).rejects.toBeInstanceOf(SubscriptionInactiveError);
  });

  it("passes for an ACTIVE subscription when enforcement is on", async () => {
    process.env.BILLING_ENFORCEMENT_ENABLED = "true";
    vi.mocked(prisma.platformSubscription.findUnique).mockResolvedValue(sub({ status: "ACTIVE" }));
    await expect(assertEntitled("r-1")).resolves.toBeUndefined();
  });
});

describe("ensureSubscription — safety-net get-or-create", () => {
  it("returns the existing row without writing", async () => {
    const existing = sub();
    vi.mocked(prisma.platformSubscription.findUnique).mockResolvedValue(existing);
    expect(await ensureSubscription("r-1")).toBe(existing);
    expect(prisma.platformSubscription.upsert).not.toHaveBeenCalled();
  });

  it("creates a fresh trial when no row exists (pre-billing restaurant)", async () => {
    vi.mocked(prisma.platformSubscription.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.platformSubscription.upsert).mockResolvedValue(sub());
    await ensureSubscription("r-1");
    const call = vi.mocked(prisma.platformSubscription.upsert).mock.calls[0][0];
    expect(call.create.restaurantId).toBe("r-1");
    expect(call.create.trialEndsAt).toBeInstanceOf(Date);
  });

  it("trial length honors BILLING_TRIAL_DAYS with a 14-day default", () => {
    expect(trialLengthDays()).toBe(14);
    process.env.BILLING_TRIAL_DAYS = "30";
    expect(trialLengthDays()).toBe(30);
  });
});
