import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/idempotency", () => ({
  reserveIdempotencyKey: vi.fn(),
  completeIdempotencyKey: vi.fn(),
  failIdempotencyKey: vi.fn(),
}));

vi.mock("../../restaurants/restaurant.service", () => ({
  getOwnRestaurantId: vi.fn(),
}));

vi.mock("./orders.service", () => ({
  listOrders: vi.fn(),
  getOwnOrder: vi.fn(),
  getOrderEvents: vi.fn(),
  getOrderTimeline: vi.fn(),
  startPreparing: vi.fn(),
  markReady: vi.fn(),
  markOutForDelivery: vi.fn(),
  completeOrder: vi.fn(),
  markPaidCash: vi.fn(),
  cancelOrder: vi.fn(),
  refundOrder: vi.fn(),
}));

vi.mock("../../../lib/prisma", () => ({
  prisma: { order: { findUnique: vi.fn() } },
}));

import type { Request, Response } from "express";
import { completeIdempotencyKey, failIdempotencyKey, reserveIdempotencyKey } from "../../../lib/idempotency";
import { prisma } from "../../../lib/prisma";
import { getOwnRestaurantId } from "../../restaurants/restaurant.service";
import {
  cancelHandler,
  completeHandler,
  getOrderEventsHandler,
  getOrderHandler,
  listOrdersHandler,
  markPaidHandler,
  publicGetOrderHandler,
  publicGetOrderTimelineHandler,
  refundHandler,
  startPreparingHandler,
} from "./orders.controller";
import { RefundExceedsRemainingBalanceError, RefundFailedError } from "../payments/payments.errors";
import { InvalidOrderTransitionError } from "./order-state-machine";
import { OrderNotFoundError } from "./orders.errors";
import {
  completeOrder,
  getOrderEvents,
  getOrderTimeline,
  getOwnOrder,
  listOrders,
  markPaidCash,
  refundOrder,
  startPreparing,
} from "./orders.service";

function mockRes() {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  return res as unknown as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("tenant isolation", () => {
  it("returns 404 (not the order) when the caller has no restaurant of their own", async () => {
    vi.mocked(getOwnRestaurantId).mockResolvedValue(null);

    const req = { user: { id: "u1" }, params: { id: "order-1" } } as unknown as Request;
    const res = mockRes();

    await getOrderHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(getOwnOrder).not.toHaveBeenCalled();
  });

  it("maps OrderNotFoundError (cross-tenant access) to 404", async () => {
    vi.mocked(getOwnRestaurantId).mockResolvedValue("r1");
    vi.mocked(getOwnOrder).mockRejectedValue(new OrderNotFoundError());

    const req = { user: { id: "u1" }, params: { id: "order-1" } } as unknown as Request;
    const res = mockRes();

    await getOrderHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("state-machine transition errors", () => {
  it("maps InvalidOrderTransitionError to 409 on a simple transition handler", async () => {
    vi.mocked(getOwnRestaurantId).mockResolvedValue("r1");
    vi.mocked(startPreparing).mockRejectedValue(
      new InvalidOrderTransitionError("PREPARING", "PREPARING"),
    );

    const req = { user: { id: "u1" }, params: { id: "order-1" } } as unknown as Request;
    const res = mockRes();

    await startPreparingHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("maps InvalidOrderTransitionError to 409 on completeHandler", async () => {
    vi.mocked(getOwnRestaurantId).mockResolvedValue("r1");
    vi.mocked(completeOrder).mockRejectedValue(
      new InvalidOrderTransitionError("CONFIRMED", "COMPLETED"),
    );

    const req = { user: { id: "u1" }, params: { id: "order-1" } } as unknown as Request;
    const res = mockRes();

    await completeHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("maps InvalidOrderTransitionError to 409 on refundHandler", async () => {
    vi.mocked(getOwnRestaurantId).mockResolvedValue("r1");
    vi.mocked(reserveIdempotencyKey).mockResolvedValue({ status: "fresh" });
    vi.mocked(refundOrder).mockRejectedValue(
      new InvalidOrderTransitionError("CANCELLED", "REFUNDED"),
    );

    const req = {
      user: { id: "u1" },
      params: { id: "order-1" },
      body: { amountCents: 500, reason: "CUSTOMER_REQUEST" },
      idempotencyKey: "key-1",
    } as unknown as Request;
    const res = mockRes();

    await refundHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("maps RefundFailedError to 502 on refundHandler", async () => {
    vi.mocked(getOwnRestaurantId).mockResolvedValue("r1");
    vi.mocked(reserveIdempotencyKey).mockResolvedValue({ status: "fresh" });
    vi.mocked(refundOrder).mockRejectedValue(new RefundFailedError("provider rejected the refund"));

    const req = {
      user: { id: "u1" },
      params: { id: "order-1" },
      body: { amountCents: 500, reason: "CUSTOMER_REQUEST" },
      idempotencyKey: "key-1",
    } as unknown as Request;
    const res = mockRes();

    await refundHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(502);
  });

  it("maps RefundExceedsRemainingBalanceError to 422 on refundHandler", async () => {
    vi.mocked(getOwnRestaurantId).mockResolvedValue("r1");
    vi.mocked(reserveIdempotencyKey).mockResolvedValue({ status: "fresh" });
    vi.mocked(refundOrder).mockRejectedValue(new RefundExceedsRemainingBalanceError());

    const req = {
      user: { id: "u1" },
      params: { id: "order-1" },
      body: { amountCents: 5000, reason: "CUSTOMER_REQUEST" },
      idempotencyKey: "key-1",
    } as unknown as Request;
    const res = mockRes();

    await refundHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
  });

  it("cancelHandler returns 400 on invalid input", async () => {
    vi.mocked(getOwnRestaurantId).mockResolvedValue("r1");

    const req = { user: { id: "u1" }, params: { id: "order-1" }, body: { reason: 12345 } } as unknown as Request;
    const res = mockRes();

    await cancelHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe("markPaidHandler idempotency (Sprint 07.7 H-2)", () => {
  it("short-circuits with the stored response when the key is already completed", async () => {
    vi.mocked(getOwnRestaurantId).mockResolvedValue("r1");
    vi.mocked(reserveIdempotencyKey).mockResolvedValue({ status: "completed", response: { order: { id: "o1" } } });

    const req = { user: { id: "u1" }, params: { id: "order-1" }, idempotencyKey: "key-1" } as unknown as Request;
    const res = mockRes();

    await markPaidHandler(req, res);

    expect(markPaidCash).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ order: { id: "o1" } });
  });

  it("returns 409 when an identical request is already in progress", async () => {
    vi.mocked(getOwnRestaurantId).mockResolvedValue("r1");
    vi.mocked(reserveIdempotencyKey).mockResolvedValue({ status: "in_progress" });

    const req = { user: { id: "u1" }, params: { id: "order-1" }, idempotencyKey: "key-1" } as unknown as Request;
    const res = mockRes();

    await markPaidHandler(req, res);

    expect(markPaidCash).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("marks the order paid and completes the key on success", async () => {
    vi.mocked(getOwnRestaurantId).mockResolvedValue("r1");
    vi.mocked(reserveIdempotencyKey).mockResolvedValue({ status: "fresh" });
    vi.mocked(markPaidCash).mockResolvedValue({ id: "order-1", paymentStatus: "PAID" } as never);

    const req = { user: { id: "u1" }, params: { id: "order-1" }, idempotencyKey: "key-1" } as unknown as Request;
    const res = mockRes();

    await markPaidHandler(req, res);

    expect(completeIdempotencyKey).toHaveBeenCalledWith("key-1", { order: { id: "order-1", paymentStatus: "PAID" } });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("fails the key and maps OrderNotFoundError to 404", async () => {
    vi.mocked(getOwnRestaurantId).mockResolvedValue("r1");
    vi.mocked(reserveIdempotencyKey).mockResolvedValue({ status: "fresh" });
    vi.mocked(markPaidCash).mockRejectedValue(new OrderNotFoundError());

    const req = { user: { id: "u1" }, params: { id: "order-1" }, idempotencyKey: "key-1" } as unknown as Request;
    const res = mockRes();

    await markPaidHandler(req, res);

    expect(failIdempotencyKey).toHaveBeenCalledWith("key-1");
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("refundHandler idempotency (Sprint 07.7 H-4)", () => {
  it("short-circuits with the stored response when the key is already completed", async () => {
    vi.mocked(getOwnRestaurantId).mockResolvedValue("r1");
    vi.mocked(reserveIdempotencyKey).mockResolvedValue({ status: "completed", response: { order: { id: "o1" } } });

    const req = {
      user: { id: "u1" },
      params: { id: "order-1" },
      body: { amountCents: 500, reason: "CUSTOMER_REQUEST" },
      idempotencyKey: "key-1",
    } as unknown as Request;
    const res = mockRes();

    await refundHandler(req, res);

    expect(refundOrder).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ order: { id: "o1" } });
  });

  it("returns 409 when an identical request is already in progress", async () => {
    vi.mocked(getOwnRestaurantId).mockResolvedValue("r1");
    vi.mocked(reserveIdempotencyKey).mockResolvedValue({ status: "in_progress" });

    const req = {
      user: { id: "u1" },
      params: { id: "order-1" },
      body: { amountCents: 500, reason: "CUSTOMER_REQUEST" },
      idempotencyKey: "key-1",
    } as unknown as Request;
    const res = mockRes();

    await refundHandler(req, res);

    expect(refundOrder).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("issues the refund and completes the key on success", async () => {
    vi.mocked(getOwnRestaurantId).mockResolvedValue("r1");
    vi.mocked(reserveIdempotencyKey).mockResolvedValue({ status: "fresh" });
    vi.mocked(refundOrder).mockResolvedValue({ id: "order-1", status: "REFUNDED" } as never);

    const req = {
      user: { id: "u1" },
      params: { id: "order-1" },
      body: { amountCents: 500, reason: "CUSTOMER_REQUEST" },
      idempotencyKey: "key-1",
    } as unknown as Request;
    const res = mockRes();

    await refundHandler(req, res);

    expect(completeIdempotencyKey).toHaveBeenCalledWith("key-1", { order: { id: "order-1", status: "REFUNDED" } });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("fails the key on a rejected refund", async () => {
    vi.mocked(getOwnRestaurantId).mockResolvedValue("r1");
    vi.mocked(reserveIdempotencyKey).mockResolvedValue({ status: "fresh" });
    vi.mocked(refundOrder).mockRejectedValue(new RefundFailedError("provider rejected"));

    const req = {
      user: { id: "u1" },
      params: { id: "order-1" },
      body: { amountCents: 500, reason: "CUSTOMER_REQUEST" },
      idempotencyKey: "key-1",
    } as unknown as Request;
    const res = mockRes();

    await refundHandler(req, res);

    expect(failIdempotencyKey).toHaveBeenCalledWith("key-1");
  });
});

describe("public order tracking", () => {
  it("publicGetOrderHandler returns the order with no auth required", async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({ id: "order-1", items: [] } as never);

    const req = { params: { id: "order-1" } } as unknown as Request;
    const res = mockRes();

    await publicGetOrderHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ order: { id: "order-1", items: [] } });
  });

  it("publicGetOrderHandler returns 404 for an unknown order id", async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null);

    const req = { params: { id: "nonexistent" } } as unknown as Request;
    const res = mockRes();

    await publicGetOrderHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("publicGetOrderTimelineHandler returns the curated milestone list", async () => {
    vi.mocked(getOrderTimeline).mockResolvedValue([{ id: "t1", milestone: "PREPARING" }] as never);

    const req = { params: { id: "order-1" } } as unknown as Request;
    const res = mockRes();

    await publicGetOrderTimelineHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ timeline: [{ id: "t1", milestone: "PREPARING" }] });
  });

  it("publicGetOrderTimelineHandler returns 404 for an unknown order id", async () => {
    vi.mocked(getOrderTimeline).mockRejectedValue(new OrderNotFoundError());

    const req = { params: { id: "nonexistent" } } as unknown as Request;
    const res = mockRes();

    await publicGetOrderTimelineHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe("kitchen financial firewall — order response redaction (P2.6.1)", () => {
  const KITCHEN_TENANT = {
    businessId: "rest-1",
    organizationId: "org-1",
    role: "RESTAURANT_STAFF",
    locationId: null,
    memberships: [
      { id: "m1", userId: "u1", role: "KITCHEN", scopeType: "BUSINESS", scopeId: "rest-1", createdAt: new Date(), updatedAt: new Date() },
    ],
    capabilities: {},
    resolvedFrom: "legacy-user-restaurant",
  };

  const orderRow = {
    id: "order-1",
    restaurantId: "rest-1",
    orderNumber: "A-001",
    status: "PENDING",
    subtotalCents: 1000,
    taxCents: 80,
    tipCents: 0,
    deliveryFeeCents: 0,
    serviceFeeCents: 0,
    discountCents: 0,
    totalCents: 1080,
    createdAt: new Date(),
  };

  afterEach(() => {
    delete process.env.KITCHEN_FIREWALL;
  });

  function kitchenReq(extra: Record<string, unknown> = {}) {
    return { user: { id: "u1", role: "RESTAURANT_STAFF" }, tenant: KITCHEN_TENANT, params: { id: "order-1" }, query: {}, ...extra } as unknown as Request;
  }

  it("flag off: returns full financial fields to a kitchen actor (inert)", async () => {
    vi.mocked(getOwnRestaurantId).mockResolvedValue("rest-1");
    vi.mocked(getOwnOrder).mockResolvedValue({ ...orderRow, items: [], payment: null } as never);
    const res = mockRes();

    await getOrderHandler(kitchenReq(), res);

    const body = vi.mocked(res.json).mock.calls[0][0] as { order: Record<string, unknown> };
    expect(body.order).toHaveProperty("totalCents", 1080);
  });

  it("observe: logs but does NOT redact (kitchen still sees money)", async () => {
    process.env.KITCHEN_FIREWALL = "observe";
    vi.mocked(getOwnRestaurantId).mockResolvedValue("rest-1");
    vi.mocked(getOwnOrder).mockResolvedValue({ ...orderRow, items: [], payment: null } as never);
    const res = mockRes();

    await getOrderHandler(kitchenReq(), res);

    const body = vi.mocked(res.json).mock.calls[0][0] as { order: Record<string, unknown> };
    expect(body.order).toHaveProperty("totalCents", 1080);
  });

  it("enforce: redacts all order money fields for a kitchen actor (detail)", async () => {
    process.env.KITCHEN_FIREWALL = "enforce";
    vi.mocked(getOwnRestaurantId).mockResolvedValue("rest-1");
    vi.mocked(getOwnOrder).mockResolvedValue({ ...orderRow, items: [], payment: null } as never);
    const res = mockRes();

    await getOrderHandler(kitchenReq(), res);

    const body = vi.mocked(res.json).mock.calls[0][0] as { order: Record<string, unknown> };
    expect(body.order).not.toHaveProperty("totalCents");
    expect(body.order).not.toHaveProperty("subtotalCents");
    expect(body.order).toMatchObject({ id: "order-1", status: "PENDING" });
  });

  it("enforce: redacts the list payload for a kitchen actor", async () => {
    process.env.KITCHEN_FIREWALL = "enforce";
    vi.mocked(getOwnRestaurantId).mockResolvedValue("rest-1");
    vi.mocked(listOrders).mockResolvedValue({ orders: [orderRow], total: 1 } as never);
    const res = mockRes();

    await listOrdersHandler(kitchenReq(), res);

    const body = vi.mocked(res.json).mock.calls[0][0] as { orders: Array<Record<string, unknown>> };
    expect(body.orders[0]).not.toHaveProperty("totalCents");
    expect(body.orders[0]).toMatchObject({ id: "order-1" });
  });

  it("enforce: omits event payload for a kitchen actor", async () => {
    process.env.KITCHEN_FIREWALL = "enforce";
    vi.mocked(getOwnRestaurantId).mockResolvedValue("rest-1");
    vi.mocked(getOrderEvents).mockResolvedValue([
      { id: "ev-1", orderId: "order-1", type: "PAID", payload: { amountCents: 1080 }, actorType: "STAFF", actorId: "u1", createdAt: new Date() },
    ] as never);
    const res = mockRes();

    await getOrderEventsHandler(kitchenReq(), res);

    const body = vi.mocked(res.json).mock.calls[0][0] as { events: Array<Record<string, unknown>> };
    expect(body.events[0]).not.toHaveProperty("payload");
    expect(body.events[0]).toMatchObject({ type: "PAID" });
  });

  it("enforce: an OWNER (money-authorized) is NOT redacted", async () => {
    process.env.KITCHEN_FIREWALL = "enforce";
    vi.mocked(getOwnRestaurantId).mockResolvedValue("rest-1");
    vi.mocked(getOwnOrder).mockResolvedValue({ ...orderRow, items: [], payment: null } as never);
    const ownerTenant = { ...KITCHEN_TENANT, memberships: [{ ...KITCHEN_TENANT.memberships[0], role: "OWNER" }] };
    const res = mockRes();

    await getOrderHandler(kitchenReq({ tenant: ownerTenant }), res);

    const body = vi.mocked(res.json).mock.calls[0][0] as { order: Record<string, unknown> };
    expect(body.order).toHaveProperty("totalCents", 1080);
  });
});
