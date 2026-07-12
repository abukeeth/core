import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    order: { findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    orderEvent: { findMany: vi.fn(), create: vi.fn() },
    orderTimeline: { findMany: vi.fn(), create: vi.fn() },
    transaction: { create: vi.fn() },
    customer: { findUnique: vi.fn() },
    guestCustomer: { findUnique: vi.fn() },
  },
}));

vi.mock("../events/record-order-event", () => ({
  emitOrderEvent: vi.fn(),
  writeOrderEvent: vi.fn(),
}));

const mockRefundOrderPayment = vi.fn();
vi.mock("../payments/orchestrator", () => ({
  refundOrderPayment: (...args: unknown[]) => mockRefundOrderPayment(...args),
}));

vi.mock("../notifications/notifications.service", () => ({
  sendOrderReadyNotification: vi.fn(),
  sendOrderOutForDeliveryNotification: vi.fn(),
  sendOrderDeliveredNotification: vi.fn(),
  sendRefundIssuedNotification: vi.fn(),
}));

import { prisma } from "../../../lib/prisma";
import {
  sendOrderDeliveredNotification,
  sendOrderOutForDeliveryNotification,
  sendOrderReadyNotification,
  sendRefundIssuedNotification,
} from "../notifications/notifications.service";
import { InvalidOrderTransitionError } from "./order-state-machine";
import { OrderNotFoundError } from "./orders.errors";
import {
  cancelOrder,
  completeOrder,
  getOwnOrder,
  markOutForDelivery,
  markPaidCash,
  markReady,
  refundOrder,
  startPreparing,
} from "./orders.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
});

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    restaurantId: "r1",
    orderNumber: 1,
    status: "CONFIRMED",
    paymentStatus: "PAID",
    totalCents: 1000,
    customerId: null,
    guestCustomerId: null,
    payment: { id: "pay-1" },
    ...overrides,
  } as never;
}

describe("tenant isolation", () => {
  it("rejects fetching an order belonging to another restaurant", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(order({ restaurantId: "other" }));
    await expect(getOwnOrder("my-restaurant", "order-1")).rejects.toBeInstanceOf(OrderNotFoundError);
  });

  it("includes the fulfillment's driverAssignment so the dashboard can show who's currently assigned (Sprint 09)", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(order());
    await getOwnOrder("r1", "order-1");
    expect(mockPrisma.order.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          fulfillment: { include: { driverAssignment: true } },
        }),
      }),
    );
  });
});

describe("state transitions", () => {
  it("startPreparing transitions CONFIRMED -> PREPARING", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(order({ status: "CONFIRMED" }));
    mockPrisma.order.update.mockResolvedValue(order({ status: "PREPARING" }));

    const result = await startPreparing("r1", "order-1");

    expect(result.status).toBe("PREPARING");
    expect(mockPrisma.orderTimeline.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ milestone: "PREPARING" }) }),
    );
  });

  it("rejects an illegal transition (e.g. completing a CONFIRMED order directly)", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(order({ status: "CONFIRMED" }));
    await expect(completeOrder("r1", "order-1")).rejects.toBeInstanceOf(InvalidOrderTransitionError);
    expect(mockPrisma.order.update).not.toHaveBeenCalled();
  });

  it("cancelOrder does not touch Payment/Transaction — cancellation never auto-refunds", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(order({ status: "CONFIRMED" }));
    mockPrisma.order.update.mockResolvedValue(order({ status: "CANCELLED" }));

    await cancelOrder("r1", "order-1", { reason: "customer changed mind" });

    expect(mockRefundOrderPayment).not.toHaveBeenCalled();
    expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
  });
});

describe("notification-failure-must-not-throw (Sprint 07.7 H-12)", () => {
  it("markReady: does not throw when the ready notification fails, and the READY transition already stuck", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(order({ status: "PREPARING", customerId: "cust-1" }));
    mockPrisma.order.update.mockResolvedValue(order({ status: "READY", customerId: "cust-1" }));
    mockPrisma.customer.findUnique.mockResolvedValue({ email: "a@b.com" } as never);
    vi.mocked(sendOrderReadyNotification).mockRejectedValue(new Error("email provider down"));

    const result = await markReady("r1", "order-1");

    expect(result.status).toBe("READY");
  });

  it("markOutForDelivery: does not throw when the notification fails", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(order({ status: "PREPARING", customerId: "cust-1" }));
    mockPrisma.order.update.mockResolvedValue(order({ status: "OUT_FOR_DELIVERY", customerId: "cust-1" }));
    mockPrisma.customer.findUnique.mockResolvedValue({ email: "a@b.com" } as never);
    vi.mocked(sendOrderOutForDeliveryNotification).mockRejectedValue(new Error("email provider down"));

    const result = await markOutForDelivery("r1", "order-1");

    expect(result.status).toBe("OUT_FOR_DELIVERY");
  });

  it("completeOrder: does not throw when the notification fails", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(order({ status: "READY", customerId: "cust-1" }));
    mockPrisma.order.update.mockResolvedValue(order({ status: "COMPLETED", customerId: "cust-1" }));
    mockPrisma.customer.findUnique.mockResolvedValue({ email: "a@b.com" } as never);
    vi.mocked(sendOrderDeliveredNotification).mockRejectedValue(new Error("email provider down"));

    const result = await completeOrder("r1", "order-1");

    expect(result.status).toBe("COMPLETED");
  });

  it("refundOrder: does not throw when the refund-issued notification fails, and the refund/state transition already stuck", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(order({ status: "CONFIRMED", totalCents: 1000, customerId: "cust-1" }));
    mockRefundOrderPayment.mockResolvedValue({ id: "refund-1" });
    mockPrisma.order.update.mockResolvedValue(order({ status: "REFUNDED", customerId: "cust-1" }));
    mockPrisma.customer.findUnique.mockResolvedValue({ email: "a@b.com" } as never);
    vi.mocked(sendRefundIssuedNotification).mockRejectedValue(new Error("email provider down"));

    const result = await refundOrder("r1", "order-1", { amountCents: 1000, reason: "CUSTOMER_REQUEST" });

    expect(result.status).toBe("REFUNDED");
  });
});

describe("markPaidCash", () => {
  it("marks paymentStatus PAID and writes a CHARGE Transaction with no provider involved", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(order({ paymentStatus: "UNPAID", totalCents: 1500 }));
    mockPrisma.order.updateMany.mockResolvedValue({ count: 1 } as never);
    mockPrisma.order.findUniqueOrThrow.mockResolvedValue(order({ paymentStatus: "PAID", totalCents: 1500 }));

    await markPaidCash("r1", "order-1");

    expect(mockPrisma.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "CHARGE", amountCents: 1500 }) }),
    );
    expect(mockRefundOrderPayment).not.toHaveBeenCalled();
  });

  it("is a no-op on a repeat call once the order is already PAID (Sprint 07.7 H-2)", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(order({ paymentStatus: "UNPAID", totalCents: 1500 }));
    mockPrisma.order.updateMany.mockResolvedValue({ count: 1 } as never);
    mockPrisma.order.findUniqueOrThrow.mockResolvedValue(order({ paymentStatus: "PAID", totalCents: 1500 }));

    await markPaidCash("r1", "order-1");

    // Second call now observes the order as already PAID.
    mockPrisma.order.findUnique.mockResolvedValue(order({ paymentStatus: "PAID", totalCents: 1500 }));
    await markPaidCash("r1", "order-1");

    expect(mockPrisma.transaction.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.order.updateMany).toHaveBeenCalledTimes(1);
  });

  it("closes the two-concurrent-call race: a second concurrent call whose atomic updateMany matches zero rows never double-writes a Transaction (Sprint 07.7 H-2, now race-safe)", async () => {
    // Both concurrent calls' initial findUnique reads observe UNPAID —
    // the race this closes is exactly that both could otherwise proceed.
    mockPrisma.order.findUnique.mockResolvedValue(order({ paymentStatus: "UNPAID", totalCents: 1500 }));
    // Simulates Postgres row-level serialization: the first call's
    // UPDATE...WHERE paymentStatus != 'PAID' commits and matches 1 row;
    // the second call's identical statement (evaluated against the
    // now-committed row) matches 0.
    mockPrisma.order.updateMany.mockResolvedValueOnce({ count: 1 } as never).mockResolvedValueOnce({ count: 0 } as never);
    mockPrisma.order.findUniqueOrThrow.mockResolvedValue(order({ paymentStatus: "PAID", totalCents: 1500 }));

    await markPaidCash("r1", "order-1");
    await markPaidCash("r1", "order-1");

    expect(mockPrisma.transaction.create).toHaveBeenCalledTimes(1);
  });
});

describe("refundOrder", () => {
  it("throws when the order has no captured payment", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(order({ payment: null }));
    await expect(
      refundOrder("r1", "order-1", { amountCents: 500, reason: "CUSTOMER_REQUEST" }),
    ).rejects.toThrow();
  });

  it("transitions the order to REFUNDED on a full refund", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(order({ status: "CONFIRMED", totalCents: 1000 }));
    mockRefundOrderPayment.mockResolvedValue({ id: "refund-1" });
    mockPrisma.order.update.mockResolvedValue(order({ status: "REFUNDED" }));

    const result = await refundOrder("r1", "order-1", { amountCents: 1000, reason: "CUSTOMER_REQUEST" });

    expect(mockRefundOrderPayment).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: "pay-1", amountCents: 1000 }),
    );
    expect(result.status).toBe("REFUNDED");
  });

  it("keeps the order's status unchanged on a partial refund, only updating paymentStatus", async () => {
    mockPrisma.order.findUnique.mockResolvedValue(order({ status: "CONFIRMED", totalCents: 1000 }));
    mockRefundOrderPayment.mockResolvedValue({ id: "refund-1" });
    mockPrisma.order.update.mockResolvedValue(order({ status: "CONFIRMED", paymentStatus: "PARTIALLY_REFUNDED" }));

    const result = await refundOrder("r1", "order-1", { amountCents: 300, reason: "ITEM_UNAVAILABLE" });

    expect(mockPrisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentStatus: "PARTIALLY_REFUNDED" }) }),
    );
    expect(result.status).toBe("CONFIRMED");
  });
});
