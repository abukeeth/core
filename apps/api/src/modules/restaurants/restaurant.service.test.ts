import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    restaurant: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { NoRestaurantError, RestaurantAlreadyExistsError, RestaurantNotFoundError } from "./restaurant.errors";
import {
  createRestaurant,
  getOwnRestaurantId,
  listReferrals,
  setSetupStep,
  suspendRestaurant,
  unsuspendRestaurant,
} from "./restaurant.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getOwnRestaurantId", () => {
  it("returns the user's restaurantId when set", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: "restaurant-1" } as never);

    await expect(getOwnRestaurantId("user-1")).resolves.toBe("restaurant-1");
  });

  it("returns null when the user has no restaurant", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: null } as never);

    await expect(getOwnRestaurantId("user-1")).resolves.toBeNull();
  });
});

describe("createRestaurant", () => {
  it("rejects if the caller already owns a restaurant", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: "existing-restaurant" } as never);

    await expect(createRestaurant("owner-1", { name: "Test" })).rejects.toBeInstanceOf(
      RestaurantAlreadyExistsError,
    );
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates a restaurant, links it to the owner, and assigns it its own referral code", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: null } as never);

    const created = { id: "new-restaurant", ownerId: "owner-1", name: "Test" };
    const txUserUpdate = vi.fn().mockResolvedValue({});
    const txRestaurantCreate = vi.fn().mockResolvedValue(created);
    const txMock = {
      restaurant: { create: txRestaurantCreate },
      user: { update: txUserUpdate },
    };
    const transactionMock = mockPrisma.$transaction as unknown as {
      mockImplementation: (fn: (callback: (tx: typeof txMock) => unknown) => unknown) => void;
    };
    transactionMock.mockImplementation((fn) => fn(txMock));

    const result = await createRestaurant("owner-1", { name: "Test" });

    expect(result).toEqual(created);
    expect(txRestaurantCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ ownerId: "owner-1", name: "Test", referredById: undefined, referralCode: expect.any(String) }),
    });
    expect(txUserUpdate).toHaveBeenCalledWith({
      where: { id: "owner-1" },
      data: { restaurantId: "new-restaurant" },
    });
  });

  it("resolves an unknown referral code to no referrer rather than failing signup", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: null } as never);
    mockPrisma.restaurant.findUnique.mockResolvedValue(null);

    const txRestaurantCreate = vi.fn().mockResolvedValue({ id: "new-restaurant" });
    const txMock = { restaurant: { create: txRestaurantCreate }, user: { update: vi.fn() } };
    const transactionMock = mockPrisma.$transaction as unknown as {
      mockImplementation: (fn: (callback: (tx: typeof txMock) => unknown) => unknown) => void;
    };
    transactionMock.mockImplementation((fn) => fn(txMock));

    await createRestaurant("owner-1", { name: "Test", referralCode: "BOGUSCODE" });

    expect(txRestaurantCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ referredById: undefined }),
    });
  });

  it("links a new restaurant to the referring restaurant when the code matches", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: null } as never);
    mockPrisma.restaurant.findUnique.mockResolvedValue({ id: "referrer-1" } as never);

    const txRestaurantCreate = vi.fn().mockResolvedValue({ id: "new-restaurant" });
    const txMock = { restaurant: { create: txRestaurantCreate }, user: { update: vi.fn() } };
    const transactionMock = mockPrisma.$transaction as unknown as {
      mockImplementation: (fn: (callback: (tx: typeof txMock) => unknown) => unknown) => void;
    };
    transactionMock.mockImplementation((fn) => fn(txMock));

    await createRestaurant("owner-1", { name: "Test", referralCode: "REFCODE1" });

    expect(txRestaurantCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ referredById: "referrer-1" }),
    });
  });

  it("defaults name to a placeholder and setupStep to BUSINESS_INFO when the wizard creates the row with only a businessType", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: null } as never);

    const txRestaurantCreate = vi.fn().mockResolvedValue({ id: "new-restaurant" });
    const txMock = { restaurant: { create: txRestaurantCreate }, user: { update: vi.fn() } };
    const transactionMock = mockPrisma.$transaction as unknown as {
      mockImplementation: (fn: (callback: (tx: typeof txMock) => unknown) => unknown) => void;
    };
    transactionMock.mockImplementation((fn) => fn(txMock));

    await createRestaurant("owner-1", { businessType: "COFFEE_SHOP" });

    expect(txRestaurantCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "My Business",
        businessType: "COFFEE_SHOP",
        setupStep: "BUSINESS_INFO",
      }),
    });
  });

  it("retries with a fresh code on a referral-code collision, and gives up after too many collisions", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: null } as never);

    const collision = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["referralCode"] },
    });
    const txRestaurantCreate = vi.fn().mockRejectedValue(collision);
    const txMock = { restaurant: { create: txRestaurantCreate }, user: { update: vi.fn() } };
    const transactionMock = mockPrisma.$transaction as unknown as {
      mockImplementation: (fn: (callback: (tx: typeof txMock) => unknown) => unknown) => void;
    };
    transactionMock.mockImplementation((fn) => fn(txMock));

    await expect(createRestaurant("owner-1", { name: "Test" })).rejects.toThrow(collision);
    expect(txRestaurantCreate).toHaveBeenCalledTimes(5);
  });
});

describe("listReferrals", () => {
  it("lists restaurants referred by the given restaurant", async () => {
    const referred = [{ id: "r2", name: "Joe's", isPublished: true, createdAt: new Date() }];
    mockPrisma.restaurant.findMany.mockResolvedValue(referred as never);

    await expect(listReferrals("r1")).resolves.toEqual(referred);
    expect(mockPrisma.restaurant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { referredById: "r1" } }),
    );
  });
});

describe("suspendRestaurant", () => {
  it("throws RestaurantNotFoundError when the restaurant does not exist", async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue(null);

    await expect(suspendRestaurant("missing")).rejects.toBeInstanceOf(RestaurantNotFoundError);
    expect(mockPrisma.restaurant.update).not.toHaveBeenCalled();
  });

  it("sets isSuspended and stores the reason", async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue({ id: "rest-1" } as never);
    mockPrisma.restaurant.update.mockResolvedValue({ id: "rest-1", isSuspended: true } as never);

    await suspendRestaurant("rest-1", "ToS violation");

    expect(mockPrisma.restaurant.update).toHaveBeenCalledWith({
      where: { id: "rest-1" },
      data: { isSuspended: true, suspendedReason: "ToS violation" },
    });
  });
});

describe("unsuspendRestaurant", () => {
  it("throws RestaurantNotFoundError when the restaurant does not exist", async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue(null);

    await expect(unsuspendRestaurant("missing")).rejects.toBeInstanceOf(RestaurantNotFoundError);
  });

  it("clears isSuspended and the stored reason", async () => {
    mockPrisma.restaurant.findUnique.mockResolvedValue({ id: "rest-1" } as never);
    mockPrisma.restaurant.update.mockResolvedValue({ id: "rest-1", isSuspended: false } as never);

    await unsuspendRestaurant("rest-1");

    expect(mockPrisma.restaurant.update).toHaveBeenCalledWith({
      where: { id: "rest-1" },
      data: { isSuspended: false, suspendedReason: null },
    });
  });
});

describe("setSetupStep", () => {
  it("throws NoRestaurantError when the caller has no business yet", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: null } as never);

    await expect(setSetupStep("owner-1", "LOCATION")).rejects.toBeInstanceOf(NoRestaurantError);
  });

  it("updates the restaurant's setupStep", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: "rest-1" } as never);
    mockPrisma.restaurant.findUnique.mockResolvedValue({ id: "rest-1" } as never);
    mockPrisma.restaurant.update.mockResolvedValue({ id: "rest-1", setupStep: "LOCATION" } as never);

    const result = await setSetupStep("owner-1", "LOCATION");

    expect(result.setupStep).toBe("LOCATION");
    expect(mockPrisma.restaurant.update).toHaveBeenCalledWith({
      where: { id: "rest-1" },
      data: { setupStep: "LOCATION" },
    });
  });
});
