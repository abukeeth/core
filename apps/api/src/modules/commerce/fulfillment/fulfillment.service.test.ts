import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    fulfillment: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    driverAssignment: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    driverLocationPing: { create: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
}));

vi.mock("../events/record-order-event", () => ({
  writeOrderEvent: vi.fn(),
  emitOrderEvent: vi.fn(),
}));

vi.mock("../notifications/notifications.service", () => ({
  sendDriverAssignmentOfferNotification: vi.fn(),
  sendDriverReassignedAwayNotification: vi.fn(),
}));

import { prisma } from "../../../lib/prisma";
import { emitOrderEvent, writeOrderEvent } from "../events/record-order-event";
import {
  sendDriverAssignmentOfferNotification,
  sendDriverReassignedAwayNotification,
} from "../notifications/notifications.service";
import {
  DriverAlreadyBusyError,
  DriverAssignmentNotFoundError,
  DriverNotOnStaffError,
  FulfillmentNotFoundError,
} from "./fulfillment.errors";
import {
  assignDriver,
  countActiveDriverAssignments,
  expireStaleOffers,
  getFulfillment,
  listDriverCandidates,
  listMyDriverAssignments,
  recordLocationPing,
  respondToAssignment,
  updateFulfillmentStatus,
} from "./fulfillment.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.driverAssignment.count.mockResolvedValue(0);
  mockPrisma.fulfillment.findUniqueOrThrow.mockResolvedValue({
    id: "f1",
    orderId: "order-1",
    order: { orderNumber: 42 },
  } as never);
});

describe("tenant isolation", () => {
  it("rejects fetching a fulfillment belonging to another restaurant", async () => {
    mockPrisma.fulfillment.findUnique.mockResolvedValue({ id: "f1", restaurantId: "other" } as never);
    await expect(getFulfillment("my-restaurant", "f1")).rejects.toBeInstanceOf(FulfillmentNotFoundError);
  });

  it("rejects updating status on a fulfillment belonging to another restaurant", async () => {
    mockPrisma.fulfillment.findUnique.mockResolvedValue({ id: "f1", restaurantId: "other" } as never);
    await expect(updateFulfillmentStatus("my-restaurant", "f1", "ASSIGNED")).rejects.toBeInstanceOf(
      FulfillmentNotFoundError,
    );
  });
});

describe("assignDriver", () => {
  it("rejects a driverId that is not RESTAURANT_STAFF for this restaurant", async () => {
    mockPrisma.fulfillment.findUnique.mockResolvedValue({ id: "f1", restaurantId: "r1" } as never);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", restaurantId: "r1", role: "RESTAURANT_OWNER" } as never);

    await expect(assignDriver("r1", "f1", "u1")).rejects.toBeInstanceOf(DriverNotOnStaffError);
  });

  it("rejects a staff member who belongs to a different restaurant", async () => {
    mockPrisma.fulfillment.findUnique.mockResolvedValue({ id: "f1", restaurantId: "r1" } as never);
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      restaurantId: "other",
      role: "RESTAURANT_STAFF",
    } as never);

    await expect(assignDriver("r1", "f1", "u1")).rejects.toBeInstanceOf(DriverNotOnStaffError);
  });

  it("creates a DriverAssignment for valid staff", async () => {
    mockPrisma.fulfillment.findUnique.mockResolvedValue({ id: "f1", restaurantId: "r1" } as never);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", restaurantId: "r1", role: "RESTAURANT_STAFF" } as never);
    mockPrisma.driverAssignment.upsert.mockResolvedValue({ id: "da1", status: "OFFERED" } as never);

    const result = await assignDriver("r1", "f1", "u1");
    expect(result.status).toBe("OFFERED");
  });

  it("sets offerExpiresAt in the future when creating a new offer", async () => {
    mockPrisma.fulfillment.findUnique.mockResolvedValue({ id: "f1", restaurantId: "r1" } as never);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", restaurantId: "r1", role: "RESTAURANT_STAFF" } as never);
    mockPrisma.driverAssignment.upsert.mockResolvedValue({ id: "da1", status: "OFFERED" } as never);

    await assignDriver("r1", "f1", "u1");

    const call = mockPrisma.driverAssignment.upsert.mock.calls[0][0];
    expect((call.create as { offerExpiresAt: Date }).offerExpiresAt.getTime()).toBeGreaterThan(Date.now());
    expect((call.update as { offerExpiresAt: Date }).offerExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("throws DriverAlreadyBusyError when the driver already has an active assignment on a different fulfillment", async () => {
    mockPrisma.fulfillment.findUnique.mockResolvedValue({ id: "f1", restaurantId: "r1" } as never);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", restaurantId: "r1", role: "RESTAURANT_STAFF" } as never);
    mockPrisma.driverAssignment.count.mockResolvedValue(1);

    await expect(assignDriver("r1", "f1", "u1")).rejects.toBeInstanceOf(DriverAlreadyBusyError);
    expect(mockPrisma.driverAssignment.upsert).not.toHaveBeenCalled();
  });

  it("excludes this fulfillment's own existing assignment from the busy count (idempotent reassignment)", async () => {
    mockPrisma.fulfillment.findUnique.mockResolvedValue({ id: "f1", restaurantId: "r1" } as never);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", restaurantId: "r1", role: "RESTAURANT_STAFF" } as never);
    mockPrisma.driverAssignment.upsert.mockResolvedValue({ id: "da1", status: "OFFERED" } as never);

    await assignDriver("r1", "f1", "u1");

    expect(mockPrisma.driverAssignment.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ fulfillmentId: { not: "f1" } }) }),
    );
  });

  it("succeeds when the driver only has terminal (DECLINED/DELIVERED) assignments", async () => {
    mockPrisma.fulfillment.findUnique.mockResolvedValue({ id: "f1", restaurantId: "r1" } as never);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", restaurantId: "r1", role: "RESTAURANT_STAFF" } as never);
    mockPrisma.driverAssignment.count.mockResolvedValue(0);
    mockPrisma.driverAssignment.upsert.mockResolvedValue({ id: "da1", status: "OFFERED" } as never);

    const result = await assignDriver("r1", "f1", "u1");
    expect(result.status).toBe("OFFERED");
  });

  it("sends a driver offer notification when the driver has a phone on file", async () => {
    mockPrisma.fulfillment.findUnique.mockResolvedValue({ id: "f1", restaurantId: "r1", orderId: "order-1" } as never);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", restaurantId: "r1", role: "RESTAURANT_STAFF", phone: "+15551234567" } as never);
    mockPrisma.driverAssignment.upsert.mockResolvedValue({ id: "da1", status: "OFFERED" } as never);

    await assignDriver("r1", "f1", "u1");

    expect(sendDriverAssignmentOfferNotification).toHaveBeenCalledWith("order-1", "r1", "+15551234567", 42);
  });

  it("does not send a notification when the driver has no phone on file", async () => {
    mockPrisma.fulfillment.findUnique.mockResolvedValue({ id: "f1", restaurantId: "r1", orderId: "order-1" } as never);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", restaurantId: "r1", role: "RESTAURANT_STAFF", phone: null } as never);
    mockPrisma.driverAssignment.upsert.mockResolvedValue({ id: "da1", status: "OFFERED" } as never);

    await assignDriver("r1", "f1", "u1");

    expect(sendDriverAssignmentOfferNotification).not.toHaveBeenCalled();
  });

  it("does not throw when the driver offer notification fails", async () => {
    mockPrisma.fulfillment.findUnique.mockResolvedValue({ id: "f1", restaurantId: "r1", orderId: "order-1" } as never);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", restaurantId: "r1", role: "RESTAURANT_STAFF", phone: "+15551234567" } as never);
    mockPrisma.driverAssignment.upsert.mockResolvedValue({ id: "da1", status: "OFFERED" } as never);
    vi.mocked(sendDriverAssignmentOfferNotification).mockRejectedValue(new Error("sms provider down"));

    const result = await assignDriver("r1", "f1", "u1");
    expect(result.status).toBe("OFFERED");
  });

  it("reassigning from driver A to driver B notifies both — A that it's reassigned away, B with the new offer (Sprint 07.7 H-8)", async () => {
    mockPrisma.fulfillment.findUnique.mockResolvedValue({ id: "f1", restaurantId: "r1", orderId: "order-1" } as never);
    mockPrisma.driverAssignment.findUnique.mockResolvedValue({
      id: "da1",
      fulfillmentId: "f1",
      driverId: "driver-a",
      status: "OFFERED",
    } as never);
    mockPrisma.user.findUnique.mockImplementation(((args: { where: { id: string } }) => {
      if (args.where.id === "driver-a") {
        return Promise.resolve({ id: "driver-a", restaurantId: "r1", role: "RESTAURANT_STAFF", phone: "+15550000001" });
      }
      return Promise.resolve({ id: "driver-b", restaurantId: "r1", role: "RESTAURANT_STAFF", phone: "+15550000002" });
    }) as never);
    mockPrisma.driverAssignment.upsert.mockResolvedValue({ id: "da1", status: "OFFERED" } as never);

    await assignDriver("r1", "f1", "driver-b");

    expect(sendDriverReassignedAwayNotification).toHaveBeenCalledWith("order-1", "r1", "+15550000001", 42);
    expect(sendDriverAssignmentOfferNotification).toHaveBeenCalledWith("order-1", "r1", "+15550000002", 42);
  });

  it("assigning a fulfillment with no prior driver only sends the new-offer notification, not a reassignment notice", async () => {
    mockPrisma.fulfillment.findUnique.mockResolvedValue({ id: "f1", restaurantId: "r1", orderId: "order-1" } as never);
    mockPrisma.driverAssignment.findUnique.mockResolvedValue(null as never);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "driver-b", restaurantId: "r1", role: "RESTAURANT_STAFF", phone: "+15550000002" } as never);
    mockPrisma.driverAssignment.upsert.mockResolvedValue({ id: "da1", status: "OFFERED" } as never);

    await assignDriver("r1", "f1", "driver-b");

    expect(sendDriverAssignmentOfferNotification).toHaveBeenCalledWith("order-1", "r1", "+15550000002", 42);
    expect(sendDriverReassignedAwayNotification).not.toHaveBeenCalled();
  });

  it("does not notify the previous driver when their assignment was already terminal (e.g. DECLINED)", async () => {
    mockPrisma.fulfillment.findUnique.mockResolvedValue({ id: "f1", restaurantId: "r1", orderId: "order-1" } as never);
    mockPrisma.driverAssignment.findUnique.mockResolvedValue({
      id: "da1",
      fulfillmentId: "f1",
      driverId: "driver-a",
      status: "DECLINED",
    } as never);
    mockPrisma.user.findUnique.mockResolvedValue({ id: "driver-b", restaurantId: "r1", role: "RESTAURANT_STAFF", phone: "+15550000002" } as never);
    mockPrisma.driverAssignment.upsert.mockResolvedValue({ id: "da1", status: "OFFERED" } as never);

    await assignDriver("r1", "f1", "driver-b");

    expect(sendDriverReassignedAwayNotification).not.toHaveBeenCalled();
  });
});

describe("listDriverCandidates", () => {
  it("returns this restaurant's staff sorted by name with a zero busy count when there are no assignments", async () => {
    mockPrisma.user.findMany.mockResolvedValue([
      { id: "u1", name: "Alice", email: "alice@example.com" },
      { id: "u2", name: "Bob", email: "bob@example.com" },
    ] as never);
    mockPrisma.driverAssignment.groupBy.mockResolvedValue([] as never);

    const result = await listDriverCandidates("r1");

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { restaurantId: "r1", role: "RESTAURANT_STAFF" } }),
    );
    expect(result).toEqual([
      { id: "u1", name: "Alice", email: "alice@example.com", activeAssignmentCount: 0 },
      { id: "u2", name: "Bob", email: "bob@example.com", activeAssignmentCount: 0 },
    ]);
  });

  it("surfaces each driver's active (busy) assignment count", async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: "u1", name: "Alice", email: "alice@example.com" }] as never);
    mockPrisma.driverAssignment.groupBy.mockResolvedValue([{ driverId: "u1", _count: { _all: 2 } }] as never);

    const result = await listDriverCandidates("r1");

    expect(result).toEqual([{ id: "u1", name: "Alice", email: "alice@example.com", activeAssignmentCount: 2 }]);
  });

  it("short-circuits without querying assignment counts when the restaurant has no staff", async () => {
    mockPrisma.user.findMany.mockResolvedValue([] as never);

    const result = await listDriverCandidates("r1");

    expect(result).toEqual([]);
    expect(mockPrisma.driverAssignment.groupBy).not.toHaveBeenCalled();
  });
});

describe("expireStaleOffers (Production Hardening Phase 6 — atomic claim-and-expire)", () => {
  it("transitions only stale OFFERED assignments and alerts staff via an OrderEvent", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: "da1", fulfillmentId: "f1", driverId: "driver-1", orderId: "order-1", restaurantId: "r1" },
    ] as never);

    const result = await expireStaleOffers();

    expect(result.expiredCount).toBe(1);
    expect(writeOrderEvent).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "order-1", restaurantId: "r1", type: "DRIVER_OFFER_EXPIRED" }),
    );
    expect(emitOrderEvent).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "order-1", restaurantId: "r1", type: "DRIVER_OFFER_EXPIRED" }),
    );
  });

  it("is a no-op when nothing is stale", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([] as never);

    const result = await expireStaleOffers();

    expect(result.expiredCount).toBe(0);
    expect(writeOrderEvent).not.toHaveBeenCalled();
  });

  it("claims via a single UPDATE ... FOR UPDATE SKIP LOCKED statement scoped to stale OFFERED rows", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([] as never);

    await expireStaleOffers();

    expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    const [sqlParts] = mockPrisma.$queryRaw.mock.calls[0] as [TemplateStringsArray];
    const sql = sqlParts.join("");
    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain("status = 'OFFERED'");
    expect(sql).toContain('"offerExpiresAt" < now()');
    expect(sql).toContain("SET status = 'EXPIRED'");
  });

  it("continues expiring remaining rows when recording one row's event fails", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: "da1", fulfillmentId: "f1", driverId: "driver-1", orderId: "order-1", restaurantId: "r1" },
      { id: "da2", fulfillmentId: "f2", driverId: "driver-2", orderId: "order-2", restaurantId: "r1" },
    ] as never);
    vi.mocked(writeOrderEvent).mockRejectedValueOnce(new Error("db blip")).mockResolvedValueOnce(undefined as never);

    const result = await expireStaleOffers();

    expect(result.expiredCount).toBe(1);
    expect(writeOrderEvent).toHaveBeenCalledTimes(2);
  });
});

describe("respondToAssignment", () => {
  it("rejects responding to an assignment that belongs to a different driver", async () => {
    mockPrisma.driverAssignment.findUnique.mockResolvedValue({ id: "da1", driverId: "other-driver" } as never);
    await expect(respondToAssignment("me", "da1", true)).rejects.toBeInstanceOf(DriverAssignmentNotFoundError);
  });
});

describe("recordLocationPing", () => {
  it("writes an append-only ping AND updates the denormalized current position atomically", async () => {
    mockPrisma.driverAssignment.findUnique.mockResolvedValue({ id: "da1" } as never);
    mockPrisma.$transaction.mockResolvedValue([{}, { id: "da1", currentLat: 41.8, currentLng: -87.6 }] as never);

    const result = await recordLocationPing("da1", 41.8, -87.6);

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(result.currentLat).toBe(41.8);
  });

  it("rejects a location ping for a nonexistent assignment", async () => {
    mockPrisma.driverAssignment.findUnique.mockResolvedValue(null as never);
    await expect(recordLocationPing("missing", 0, 0)).rejects.toBeInstanceOf(DriverAssignmentNotFoundError);
  });
});

describe("listMyDriverAssignments", () => {
  it("scopes to the calling driver's own busy assignments for this restaurant", async () => {
    mockPrisma.driverAssignment.findMany.mockResolvedValue([{ id: "da1", driverId: "driver-1" }] as never);

    const result = await listMyDriverAssignments("r1", "driver-1");

    expect(result).toHaveLength(1);
    expect(mockPrisma.driverAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          driverId: "driver-1",
          status: { in: ["OFFERED", "ACCEPTED", "EN_ROUTE"] },
          fulfillment: expect.objectContaining({ restaurantId: "r1" }),
        }),
      }),
    );
  });
});

describe("countActiveDriverAssignments", () => {
  it("counts only busy-status assignments on non-terminal fulfillments", async () => {
    mockPrisma.driverAssignment.count.mockResolvedValue(3);

    const count = await countActiveDriverAssignments("r1");

    expect(count).toBe(3);
    expect(mockPrisma.driverAssignment.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["OFFERED", "ACCEPTED", "EN_ROUTE"] },
        }),
      }),
    );
  });
});
