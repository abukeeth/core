import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    deliveryZone: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
    deliveryRule: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));

import { prisma } from "../../../lib/prisma";
import {
  DeliveryRuleNotFoundError,
  DeliveryZoneNotFoundError,
  FulfillmentMethodNotAvailableError,
  InvalidFallbackRuleError,
} from "./delivery-zones.errors";
import { createRule, deleteZone, updateRule, updateZone } from "./zones.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("tenant isolation", () => {
  it("rejects updating a zone belonging to another restaurant", async () => {
    mockPrisma.deliveryZone.findUnique.mockResolvedValue({ id: "z1", restaurantId: "other" } as never);
    await expect(updateZone("my-restaurant", "z1", { name: "Hacked" })).rejects.toBeInstanceOf(
      DeliveryZoneNotFoundError,
    );
  });

  it("rejects deleting a zone belonging to another restaurant", async () => {
    mockPrisma.deliveryZone.findUnique.mockResolvedValue({ id: "z1", restaurantId: "other" } as never);
    await expect(deleteZone("my-restaurant", "z1")).rejects.toBeInstanceOf(DeliveryZoneNotFoundError);
  });

  it("rejects updating a rule belonging to another restaurant", async () => {
    mockPrisma.deliveryRule.findUnique.mockResolvedValue({ id: "dr1", restaurantId: "other" } as never);
    await expect(updateRule("my-restaurant", "dr1", {})).rejects.toBeInstanceOf(DeliveryRuleNotFoundError);
  });
});

describe("fallbackToRuleId validation", () => {
  it("rejects creating a rule whose fallback points to another restaurant's rule", async () => {
    mockPrisma.deliveryRule.findUnique.mockResolvedValue({ id: "fb1", restaurantId: "other" } as never);

    await expect(
      createRule("my-restaurant", { fulfillmentMethod: "RESTAURANT_DRIVER", fallbackToRuleId: "fb1" }),
    ).rejects.toBeInstanceOf(InvalidFallbackRuleError);
  });

  it("rejects creating a rule whose fallback does not exist", async () => {
    mockPrisma.deliveryRule.findUnique.mockResolvedValue(null as never);

    await expect(
      createRule("my-restaurant", { fulfillmentMethod: "RESTAURANT_DRIVER", fallbackToRuleId: "missing" }),
    ).rejects.toBeInstanceOf(InvalidFallbackRuleError);
  });

  it("allows a fallback that belongs to the same restaurant", async () => {
    mockPrisma.deliveryRule.findUnique.mockResolvedValue({ id: "fb1", restaurantId: "r1" } as never);
    mockPrisma.deliveryRule.create.mockResolvedValue({ id: "new-rule" } as never);

    const result = await createRule("r1", { fulfillmentMethod: "RESTAURANT_DRIVER", fallbackToRuleId: "fb1" });

    expect(result.id).toBe("new-rule");
  });

  it("rejects updateRule setting fallbackToRuleId to point at itself (Sprint 07.7 H-9)", async () => {
    mockPrisma.deliveryRule.findUnique.mockResolvedValue({ id: "rule-1", restaurantId: "r1", fallbackToRuleId: null } as never);

    await expect(
      updateRule("r1", "rule-1", { fallbackToRuleId: "rule-1" }),
    ).rejects.toBeInstanceOf(InvalidFallbackRuleError);
  });

  it("rejects updateRule creating a two-rule mutual-fallback cycle (A -> B, B -> A) (Sprint 07.7 H-9)", async () => {
    // Rule A already has fallbackToRuleId: "rule-b". Now updating rule B to
    // fall back to A would close the loop.
    mockPrisma.deliveryRule.findUnique.mockImplementation(((args: { where: { id: string } }) => {
      if (args.where.id === "rule-b") {
        return Promise.resolve({ id: "rule-b", restaurantId: "r1", fallbackToRuleId: null });
      }
      if (args.where.id === "rule-a") {
        return Promise.resolve({ id: "rule-a", restaurantId: "r1", fallbackToRuleId: "rule-b" });
      }
      return Promise.resolve(null);
    }) as never);

    await expect(
      updateRule("r1", "rule-b", { fallbackToRuleId: "rule-a" }),
    ).rejects.toBeInstanceOf(InvalidFallbackRuleError);
  });

  it("allows updateRule to set a fallback that does not create a cycle", async () => {
    mockPrisma.deliveryRule.findUnique.mockImplementation(((args: { where: { id: string } }) => {
      if (args.where.id === "rule-c") {
        return Promise.resolve({ id: "rule-c", restaurantId: "r1", fallbackToRuleId: null });
      }
      if (args.where.id === "rule-b") {
        return Promise.resolve({ id: "rule-b", restaurantId: "r1", fallbackToRuleId: null });
      }
      return Promise.resolve(null);
    }) as never);
    mockPrisma.deliveryRule.update.mockResolvedValue({ id: "rule-b" } as never);

    const result = await updateRule("r1", "rule-b", { fallbackToRuleId: "rule-c" });

    expect(result.id).toBe("rule-b");
  });
});

describe("fulfillmentMethod availability gate", () => {
  // The fulfillment provider registry is real here (not mocked): Uber Direct /
  // DoorDash Drive / Local Courier adapters ship with implemented=false, so a
  // rule routing to them must be rejected until those providers are built.
  it("rejects creating a rule that routes to a stub external provider (UBER_DIRECT)", async () => {
    await expect(
      createRule("r1", { fulfillmentMethod: "UBER_DIRECT" }),
    ).rejects.toBeInstanceOf(FulfillmentMethodNotAvailableError);
    expect(mockPrisma.deliveryRule.create).not.toHaveBeenCalled();
  });

  it("rejects DOORDASH_DRIVE the same way", async () => {
    await expect(
      createRule("r1", { fulfillmentMethod: "DOORDASH_DRIVE" }),
    ).rejects.toBeInstanceOf(FulfillmentMethodNotAvailableError);
  });

  it("allows the internal RESTAURANT_DRIVER method (no external provider needed)", async () => {
    mockPrisma.deliveryRule.create.mockResolvedValue({ id: "new-rule" } as never);

    const result = await createRule("r1", { fulfillmentMethod: "RESTAURANT_DRIVER" });

    expect(result.id).toBe("new-rule");
  });

  it("allows the internal PICKUP method", async () => {
    mockPrisma.deliveryRule.create.mockResolvedValue({ id: "pickup-rule" } as never);

    const result = await createRule("r1", { fulfillmentMethod: "PICKUP" });

    expect(result.id).toBe("pickup-rule");
  });

  it("rejects updating an existing rule to a stub external provider", async () => {
    mockPrisma.deliveryRule.findUnique.mockResolvedValue({ id: "rule-1", restaurantId: "r1", fallbackToRuleId: null } as never);

    await expect(
      updateRule("r1", "rule-1", { fulfillmentMethod: "UBER_DIRECT" }),
    ).rejects.toBeInstanceOf(FulfillmentMethodNotAvailableError);
    expect(mockPrisma.deliveryRule.update).not.toHaveBeenCalled();
  });
});
