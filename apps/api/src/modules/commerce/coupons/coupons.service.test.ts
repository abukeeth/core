import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    coupon: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
    couponRedemption: { count: vi.fn() },
  },
}));

import { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { CouponCodeInUseError, CouponInvalidError, CouponNotFoundError } from "./coupons.errors";
import { createCoupon, deleteCoupon, listActiveCoupons, validateCouponForRedemption } from "./coupons.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

function coupon(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    restaurantId: "r1",
    code: "SAVE10",
    type: "PERCENTAGE",
    value: 1000, // 10%
    minOrderCents: null,
    maxDiscountCents: null,
    startsAt: null,
    expiresAt: null,
    maxRedemptions: null,
    maxRedemptionsPerCustomer: null,
    isActive: true,
    ...overrides,
  } as never;
}

describe("createCoupon", () => {
  it("maps a duplicate [restaurantId, code] to CouponCodeInUseError", async () => {
    mockPrisma.coupon.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }),
    );

    await expect(
      createCoupon("r1", { code: "SAVE10", type: "PERCENTAGE", value: 1000 }),
    ).rejects.toBeInstanceOf(CouponCodeInUseError);
  });
});

describe("tenant isolation", () => {
  it("rejects deleting a coupon belonging to another restaurant", async () => {
    mockPrisma.coupon.findUnique.mockResolvedValue(coupon({ restaurantId: "other" }));
    await expect(deleteCoupon("my-restaurant", "c1")).rejects.toBeInstanceOf(CouponNotFoundError);
  });
});

describe("validateCouponForRedemption", () => {
  it("throws CouponNotFoundError for an unknown code", async () => {
    mockPrisma.coupon.findUnique.mockResolvedValue(null as never);
    await expect(validateCouponForRedemption("r1", "NOPE", 1000)).rejects.toBeInstanceOf(CouponNotFoundError);
  });

  it("rejects an inactive coupon", async () => {
    mockPrisma.coupon.findUnique.mockResolvedValue(coupon({ isActive: false }));
    await expect(validateCouponForRedemption("r1", "SAVE10", 1000)).rejects.toBeInstanceOf(CouponInvalidError);
  });

  it("rejects a coupon that hasn't started yet", async () => {
    mockPrisma.coupon.findUnique.mockResolvedValue(coupon({ startsAt: new Date(Date.now() + 86_400_000) }));
    await expect(validateCouponForRedemption("r1", "SAVE10", 1000)).rejects.toBeInstanceOf(CouponInvalidError);
  });

  it("rejects an expired coupon", async () => {
    mockPrisma.coupon.findUnique.mockResolvedValue(coupon({ expiresAt: new Date(Date.now() - 86_400_000) }));
    await expect(validateCouponForRedemption("r1", "SAVE10", 1000)).rejects.toBeInstanceOf(CouponInvalidError);
  });

  it("rejects an order below the minimum", async () => {
    mockPrisma.coupon.findUnique.mockResolvedValue(coupon({ minOrderCents: 2000 }));
    await expect(validateCouponForRedemption("r1", "SAVE10", 1000)).rejects.toBeInstanceOf(CouponInvalidError);
  });

  it("rejects once maxRedemptions is reached", async () => {
    mockPrisma.coupon.findUnique.mockResolvedValue(coupon({ maxRedemptions: 5 }));
    mockPrisma.couponRedemption.count.mockResolvedValue(5);
    await expect(validateCouponForRedemption("r1", "SAVE10", 1000)).rejects.toBeInstanceOf(CouponInvalidError);
  });

  it("rejects once a specific customer has hit maxRedemptionsPerCustomer", async () => {
    mockPrisma.coupon.findUnique.mockResolvedValue(coupon({ maxRedemptionsPerCustomer: 1 }));
    mockPrisma.couponRedemption.count.mockResolvedValue(1);
    await expect(validateCouponForRedemption("r1", "SAVE10", 1000, "cust-1")).rejects.toBeInstanceOf(
      CouponInvalidError,
    );
  });

  it("skips the per-customer check entirely when no identity (customerId or guestCustomerId) is known", async () => {
    mockPrisma.coupon.findUnique.mockResolvedValue(coupon({ maxRedemptionsPerCustomer: 1 }));

    const result = await validateCouponForRedemption("r1", "SAVE10", 1000);

    expect(mockPrisma.couponRedemption.count).not.toHaveBeenCalled();
    expect(result.discountCents).toBe(100);
  });

  it("rejects once a guest (keyed by guestCustomerId) has hit maxRedemptionsPerCustomer (Sprint 07.7 H-5)", async () => {
    mockPrisma.coupon.findUnique.mockResolvedValue(coupon({ maxRedemptionsPerCustomer: 1 }));
    mockPrisma.couponRedemption.count.mockResolvedValue(1);

    await expect(
      validateCouponForRedemption("r1", "SAVE10", 1000, undefined, "guest-1"),
    ).rejects.toBeInstanceOf(CouponInvalidError);
    expect(mockPrisma.couponRedemption.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: { couponId: "c1", guestCustomerId: "guest-1" } }),
    );
  });

  it("allows a guest under their per-customer limit (Sprint 07.7 H-5)", async () => {
    mockPrisma.coupon.findUnique.mockResolvedValue(coupon({ maxRedemptionsPerCustomer: 2 }));
    mockPrisma.couponRedemption.count.mockResolvedValue(1);

    const result = await validateCouponForRedemption("r1", "SAVE10", 1000, undefined, "guest-1");

    expect(result.discountCents).toBe(100);
  });

  it("computes a PERCENTAGE discount, capped by maxDiscountCents", async () => {
    mockPrisma.coupon.findUnique.mockResolvedValue(coupon({ value: 5000, maxDiscountCents: 300 })); // 50%, capped at $3
    const result = await validateCouponForRedemption("r1", "SAVE10", 1000);
    expect(result.discountCents).toBe(300);
  });

  it("computes a FIXED_AMOUNT discount that never exceeds the subtotal", async () => {
    mockPrisma.coupon.findUnique.mockResolvedValue(coupon({ type: "FIXED_AMOUNT", value: 5000 }));
    const result = await validateCouponForRedemption("r1", "SAVE10", 1000);
    expect(result.discountCents).toBe(1000);
  });

  it("returns discountCents 0 for FREE_DELIVERY (applied separately by checkout)", async () => {
    mockPrisma.coupon.findUnique.mockResolvedValue(coupon({ type: "FREE_DELIVERY", value: 0 }));
    const result = await validateCouponForRedemption("r1", "SAVE10", 1000);
    expect(result.discountCents).toBe(0);
  });
});

describe("listActiveCoupons (Sprint 20A Task 5 — storefront Offers section)", () => {
  it("scopes to isActive plus the same start/expiry window validateCouponForRedemption enforces, newest first", async () => {
    mockPrisma.coupon.findMany.mockResolvedValue([] as never);

    await listActiveCoupons("r1");

    expect(mockPrisma.coupon.findMany).toHaveBeenCalledWith({
      where: {
        restaurantId: "r1",
        isActive: true,
        OR: [{ startsAt: null }, { startsAt: { lte: expect.any(Date) } }],
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: expect.any(Date) } }] }],
      },
      orderBy: { createdAt: "desc" },
    });
  });

  it("returns whatever the scoped query resolves", async () => {
    mockPrisma.coupon.findMany.mockResolvedValue([coupon({ code: "SAVE10" })] as never);
    const result = await listActiveCoupons("r1");
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("SAVE10");
  });
});
