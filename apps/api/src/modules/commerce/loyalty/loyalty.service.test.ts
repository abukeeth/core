import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    loyaltyProgram: { findUnique: vi.fn(), upsert: vi.fn() },
    loyaltyAccount: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    loyaltyTransaction: { findFirst: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "../../../lib/prisma";
import {
  computePointsEarned,
  computeRedemptionDiscountCents,
  earnPointsForCompletedOrder,
  redeemPointsInTransaction,
} from "./loyalty.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("computePointsEarned", () => {
  it("returns 0 when the program is inactive", () => {
    expect(computePointsEarned({ isActive: false, pointsPerDollarCents: 10 }, 5000)).toBe(0);
  });

  it("returns 0 when pointsPerDollarCents is 0", () => {
    expect(computePointsEarned({ isActive: true, pointsPerDollarCents: 0 }, 5000)).toBe(0);
  });

  it("computes points per whole dollar of subtotal, flooring partial dollars", () => {
    // $10.50 subtotal * 10 points/dollar -> floors to 10 whole dollars -> 100 points
    expect(computePointsEarned({ isActive: true, pointsPerDollarCents: 10 }, 1050)).toBe(100);
  });
});

describe("computeRedemptionDiscountCents", () => {
  it("returns 0 when there is no program", () => {
    expect(computeRedemptionDiscountCents(null, 100)).toBe(0);
  });

  it("returns 0 when the program is inactive", () => {
    expect(computeRedemptionDiscountCents({ isActive: false, redemptionRateCentsPerPoint: 1 }, 100)).toBe(0);
  });

  it("multiplies points by the redemption rate", () => {
    expect(computeRedemptionDiscountCents({ isActive: true, redemptionRateCentsPerPoint: 2 }, 100)).toBe(200);
  });
});

describe("earnPointsForCompletedOrder", () => {
  function order(overrides: Record<string, unknown> = {}) {
    return {
      id: "order-1",
      restaurantId: "r1",
      customerId: "cust-1",
      subtotalCents: 2000,
      ...overrides,
    } as never;
  }

  it("is a no-op for guest orders (no customerId)", async () => {
    await earnPointsForCompletedOrder(order({ customerId: null }));
    expect(mockPrisma.loyaltyProgram.findUnique).not.toHaveBeenCalled();
  });

  it("is a no-op when the restaurant has no loyalty program", async () => {
    mockPrisma.loyaltyProgram.findUnique.mockResolvedValue(null);
    await earnPointsForCompletedOrder(order());
    expect(mockPrisma.loyaltyTransaction.findFirst).not.toHaveBeenCalled();
  });

  it("is a no-op when the computed points are 0", async () => {
    mockPrisma.loyaltyProgram.findUnique.mockResolvedValue({ isActive: true, pointsPerDollarCents: 0 } as never);
    await earnPointsForCompletedOrder(order());
    expect(mockPrisma.loyaltyTransaction.findFirst).not.toHaveBeenCalled();
  });

  it("is idempotent: does not double-credit when an EARN transaction for this order already exists", async () => {
    mockPrisma.loyaltyProgram.findUnique.mockResolvedValue({ isActive: true, pointsPerDollarCents: 10 } as never);
    mockPrisma.loyaltyTransaction.findFirst.mockResolvedValue({ id: "existing-txn" } as never);

    await earnPointsForCompletedOrder(order());

    expect(mockPrisma.loyaltyAccount.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("credits the account and writes an EARN transaction for a first-time completion", async () => {
    mockPrisma.loyaltyProgram.findUnique.mockResolvedValue({ isActive: true, pointsPerDollarCents: 10 } as never);
    mockPrisma.loyaltyTransaction.findFirst.mockResolvedValue(null);
    mockPrisma.loyaltyAccount.upsert.mockResolvedValue({ id: "account-1" } as never);

    await earnPointsForCompletedOrder(order());

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe("redeemPointsInTransaction", () => {
  function fakeTx() {
    return {
      loyaltyAccount: { findUnique: vi.fn(), updateMany: vi.fn() },
      loyaltyTransaction: { create: vi.fn() },
    };
  }

  it("returns false when the customer has no account for this restaurant", async () => {
    const tx = fakeTx();
    tx.loyaltyAccount.findUnique.mockResolvedValue(null);

    const result = await redeemPointsInTransaction(tx as never, "cust-1", "r1", 100, "order-1");

    expect(result).toBe(false);
    expect(tx.loyaltyAccount.updateMany).not.toHaveBeenCalled();
  });

  it("closes the double-redeem race: returns false when the guarded UPDATE matches zero rows", async () => {
    const tx = fakeTx();
    tx.loyaltyAccount.findUnique.mockResolvedValue({ id: "account-1", pointsBalance: 50 });
    tx.loyaltyAccount.updateMany.mockResolvedValue({ count: 0 });

    const result = await redeemPointsInTransaction(tx as never, "cust-1", "r1", 100, "order-1");

    expect(result).toBe(false);
    expect(tx.loyaltyTransaction.create).not.toHaveBeenCalled();
  });

  it("debits the balance and writes a negative-points REDEEM transaction on success", async () => {
    const tx = fakeTx();
    tx.loyaltyAccount.findUnique.mockResolvedValue({ id: "account-1", pointsBalance: 200 });
    tx.loyaltyAccount.updateMany.mockResolvedValue({ count: 1 });

    const result = await redeemPointsInTransaction(tx as never, "cust-1", "r1", 100, "order-1");

    expect(result).toBe(true);
    expect(tx.loyaltyAccount.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "account-1", pointsBalance: { gte: 100 } } }),
    );
    expect(tx.loyaltyTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ points: -100, type: "REDEEM", orderId: "order-1" }) }),
    );
  });
});
