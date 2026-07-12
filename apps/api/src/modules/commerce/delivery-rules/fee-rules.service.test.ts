import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    deliveryFeeRule: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    serviceFeeRule: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));

import { prisma } from "../../../lib/prisma";
import { DeliveryFeeRuleNotFoundError, ServiceFeeRuleNotFoundError } from "./fee-rules.errors";
import {
  deleteServiceFeeRule,
  resolveDeliveryFeeCents,
  resolveServiceFeeCents,
  updateDeliveryFeeRule,
} from "./fee-rules.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

function feeRule(overrides: Record<string, unknown> = {}) {
  return {
    id: "fr1",
    restaurantId: "r1",
    minDistanceMiles: null,
    maxDistanceMiles: null,
    feeType: "FLAT",
    feeValue: 299,
    priority: 0,
    isActive: true,
    ...overrides,
  } as never;
}

describe("resolveDeliveryFeeCents", () => {
  it("returns 0 when no rule matches", () => {
    expect(resolveDeliveryFeeCents([], 3, 1000)).toBe(0);
  });

  it("computes a FLAT fee", () => {
    expect(resolveDeliveryFeeCents([feeRule({ feeType: "FLAT", feeValue: 299 })], 3, 1000)).toBe(299);
  });

  it("computes a PER_MILE fee, rounded to the nearest cent", () => {
    expect(resolveDeliveryFeeCents([feeRule({ feeType: "PER_MILE", feeValue: 75 })], 3, 1000)).toBe(225);
  });

  it("computes a PERCENTAGE_OF_SUBTOTAL fee from basis points", () => {
    // 500 basis points = 5%
    expect(resolveDeliveryFeeCents([feeRule({ feeType: "PERCENTAGE_OF_SUBTOTAL", feeValue: 500 })], 3, 2000)).toBe(
      100,
    );
  });

  it("picks the first active rule in priority order whose distance band matches", () => {
    const rules = [
      feeRule({ id: "far", minDistanceMiles: 5, maxDistanceMiles: 20, feeType: "FLAT", feeValue: 499, priority: 1 }),
      feeRule({ id: "near", minDistanceMiles: 0, maxDistanceMiles: 5, feeType: "FLAT", feeValue: 199, priority: 0 }),
    ];
    expect(resolveDeliveryFeeCents(rules, 3, 1000)).toBe(199);
  });

  it("ignores inactive rules", () => {
    expect(resolveDeliveryFeeCents([feeRule({ isActive: false, feeValue: 999 })], 3, 1000)).toBe(0);
  });
});

describe("resolveServiceFeeCents", () => {
  function serviceRule(overrides: Record<string, unknown> = {}) {
    return {
      id: "sr1",
      restaurantId: "r1",
      feeType: "FLAT",
      feeValue: 150,
      appliesTo: "ALL_ORDERS",
      isActive: true,
      ...overrides,
    } as never;
  }

  it("sums every applicable active rule for the given fulfillment type", () => {
    const rules = [
      serviceRule({ appliesTo: "ALL_ORDERS", feeType: "FLAT", feeValue: 100 }),
      serviceRule({ appliesTo: "DELIVERY_ONLY", feeType: "FLAT", feeValue: 50 }),
      serviceRule({ appliesTo: "PICKUP_ONLY", feeType: "FLAT", feeValue: 999 }),
    ];
    expect(resolveServiceFeeCents(rules, "DELIVERY", 1000)).toBe(150);
  });

  it("computes a PERCENTAGE_OF_SUBTOTAL service fee", () => {
    const rules = [serviceRule({ feeType: "PERCENTAGE_OF_SUBTOTAL", feeValue: 200 })]; // 2%
    expect(resolveServiceFeeCents(rules, "PICKUP", 5000)).toBe(100);
  });

  it("excludes rules scoped to a different fulfillment type", () => {
    const rules = [serviceRule({ appliesTo: "DINE_IN_ONLY", feeValue: 999 })];
    expect(resolveServiceFeeCents(rules, "PICKUP", 1000)).toBe(0);
  });
});

describe("tenant isolation", () => {
  it("rejects updating a delivery fee rule belonging to another restaurant", async () => {
    mockPrisma.deliveryFeeRule.findUnique.mockResolvedValue({ id: "fr1", restaurantId: "other" } as never);
    await expect(updateDeliveryFeeRule("my-restaurant", "fr1", {})).rejects.toBeInstanceOf(
      DeliveryFeeRuleNotFoundError,
    );
  });

  it("rejects deleting a service fee rule belonging to another restaurant", async () => {
    mockPrisma.serviceFeeRule.findUnique.mockResolvedValue({ id: "sr1", restaurantId: "other" } as never);
    await expect(deleteServiceFeeRule("my-restaurant", "sr1")).rejects.toBeInstanceOf(ServiceFeeRuleNotFoundError);
  });
});
