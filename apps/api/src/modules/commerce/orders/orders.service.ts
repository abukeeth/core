import type { Order, OrderEvent, OrderTimeline, Prisma, RefundReason } from "@prisma/client";
import { bestEffort } from "../../../lib/best-effort";
import { prisma } from "../../../lib/prisma";
import { emitOrderEvent, writeOrderEvent } from "../events/record-order-event";
import { earnPointsForCompletedOrder } from "../loyalty/loyalty.service";
import { refundOrderPayment } from "../payments/orchestrator";
import {
  sendOrderDeliveredNotification,
  sendOrderOutForDeliveryNotification,
  sendOrderReadyNotification,
  sendRefundIssuedNotification,
} from "../notifications/notifications.service";
import { assertValidOrderTransition } from "./order-state-machine";
import { OrderNotFoundError } from "./orders.errors";
import type { CancelOrderInput, ListOrdersQuery, RefundOrderInput } from "./orders.validation";

export async function listOrders(restaurantId: string, query: ListOrdersQuery): Promise<{ orders: Order[]; total: number }> {
  const where = { restaurantId, status: query.status, source: query.source };
  const [orders, total] = await Promise.all([
    prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, take: query.limit, skip: query.offset }),
    prisma.order.count({ where }),
  ]);
  return { orders, total };
}

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: { items: true; payment: true; fulfillment: { include: { driverAssignment: true } } };
}>;

export async function getOwnOrder(restaurantId: string, orderId: string): Promise<OrderWithRelations> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true, payment: true, fulfillment: { include: { driverAssignment: true } } },
  });
  if (!order || order.restaurantId !== restaurantId) {
    throw new OrderNotFoundError();
  }
  return order;
}

export async function getOrderEvents(restaurantId: string, orderId: string): Promise<OrderEvent[]> {
  await getOwnOrder(restaurantId, orderId);
  return prisma.orderEvent.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
}

/** Public, curated milestones — no tenant check (used by both staff and the customer tracking page). */
export async function getOrderTimeline(orderId: string): Promise<OrderTimeline[]> {
  const exists = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true } });
  if (!exists) {
    throw new OrderNotFoundError();
  }
  return prisma.orderTimeline.findMany({ where: { orderId }, orderBy: { occurredAt: "asc" } });
}

async function transition(
  restaurantId: string,
  orderId: string,
  to: Order["status"],
  eventType: Parameters<typeof writeOrderEvent>[0]["type"],
  milestone?: OrderTimeline["milestone"],
  extra?: Partial<Order>,
): Promise<Order> {
  const order = await getOwnOrder(restaurantId, orderId);
  assertValidOrderTransition(order.status, to);

  const updated = await prisma.order.update({ where: { id: order.id }, data: { status: to, ...extra } });
  await writeOrderEvent({ orderId: order.id, restaurantId, type: eventType });
  if (milestone) {
    await prisma.orderTimeline.create({ data: { orderId: order.id, milestone } });
  }
  emitOrderEvent({ orderId: order.id, restaurantId, type: eventType });
  return updated;
}

export async function startPreparing(restaurantId: string, orderId: string): Promise<Order> {
  return transition(restaurantId, orderId, "PREPARING", "KITCHEN_STARTED", "PREPARING");
}

export async function markReady(restaurantId: string, orderId: string): Promise<Order> {
  const order = await transition(restaurantId, orderId, "READY", "ORDER_READY", "READY", { readyAt: new Date() });
  const email = await resolveCustomerEmail(order);
  if (email) {
    // The status transition above already committed — a notification
    // failure must never surface as a 500 for an action that actually
    // succeeded (Sprint 07.7 H-12, same pattern as C-2/C-15).
    await bestEffort(() => sendOrderReadyNotification(order.id, restaurantId, email, order.orderNumber));
  }
  return order;
}

export async function markOutForDelivery(restaurantId: string, orderId: string): Promise<Order> {
  const order = await transition(restaurantId, orderId, "OUT_FOR_DELIVERY", "ORDER_OUT_FOR_DELIVERY", "OUT_FOR_DELIVERY");
  const email = await resolveCustomerEmail(order);
  if (email) {
    await bestEffort(() => sendOrderOutForDeliveryNotification(order.id, restaurantId, email, order.orderNumber));
  }
  return order;
}

export async function completeOrder(restaurantId: string, orderId: string): Promise<Order> {
  const order = await transition(restaurantId, orderId, "COMPLETED", "ORDER_COMPLETED", "COMPLETED", { completedAt: new Date() });
  await bestEffort(() => earnPointsForCompletedOrder(order));
  const email = await resolveCustomerEmail(order);
  if (email) {
    await bestEffort(() => sendOrderDeliveredNotification(order.id, restaurantId, email, order.orderNumber));
  }
  return order;
}

/**
 * Cancellation does NOT auto-refund — a captured payment stays captured
 * until staff explicitly issues a refund via refundOrder. This keeps
 * money movement always an explicit, staff-initiated action, never an
 * implicit side effect of a status change.
 */
export async function cancelOrder(restaurantId: string, orderId: string, input: CancelOrderInput): Promise<Order> {
  return transition(restaurantId, orderId, "CANCELLED", "ORDER_CANCELLED", "CANCELLED", {
    cancelledAt: new Date(),
    cancellationReason: input.reason,
  });
}

/**
 * For CASH_ON_DELIVERY/CASH_AT_PICKUP orders — no provider was ever
 * involved, so a Transaction row is written directly here. Idempotent:
 * repeat calls (a double-submitted staff click, or an idempotency-key
 * retry) are a no-op once the order is already PAID, so a second call
 * never writes a second Transaction row for the same charge (Sprint 07.7
 * H-2).
 */
export async function markPaidCash(restaurantId: string, orderId: string): Promise<Order> {
  const order = await getOwnOrder(restaurantId, orderId);
  if (order.paymentStatus === "PAID") {
    return order;
  }
  // updateMany's WHERE + UPDATE is one atomic statement, so two
  // concurrent calls (a double-submitted staff click, or two different
  // idempotency-key retries racing) can't both observe "not yet PAID"
  // and both write a Transaction row for the same charge — only the one
  // that actually flips paymentStatus (count === 1) does.
  const { count } = await prisma.order.updateMany({
    where: { id: order.id, paymentStatus: { not: "PAID" } },
    data: { paymentStatus: "PAID" },
  });
  if (count === 1) {
    await prisma.transaction.create({ data: { orderId: order.id, restaurantId, type: "CHARGE", amountCents: order.totalCents } });
  }
  return prisma.order.findUniqueOrThrow({ where: { id: order.id } });
}

/**
 * Money movement: delegates the actual provider call to
 * payments/orchestrator's refundOrderPayment (built alongside the
 * payment orchestration engine), then reacts with the correct
 * state-machine transition — REFUNDED only for a full refund; a partial
 * refund updates Payment.status (already handled inside the orchestrator)
 * without moving Order.status off its current value.
 */
export async function refundOrder(
  restaurantId: string,
  orderId: string,
  input: RefundOrderInput,
  initiatedById?: string,
): Promise<Order> {
  const order = await getOwnOrder(restaurantId, orderId);
  if (!order.payment) {
    throw new Error("This order has no captured payment to refund");
  }

  await refundOrderPayment({
    paymentId: order.payment.id,
    amountCents: input.amountCents,
    reason: input.reason as RefundReason,
    initiatedById,
    restaurantId,
  });

  await writeOrderEvent({ orderId: order.id, restaurantId, type: "REFUND_ISSUED" });
  emitOrderEvent({ orderId: order.id, restaurantId, type: "REFUND_ISSUED" });

  const isFullRefund = input.amountCents >= order.totalCents;
  let updated = order as Order;
  if (isFullRefund && order.status !== "REFUNDED") {
    assertValidOrderTransition(order.status, "REFUNDED");
    updated = await prisma.order.update({ where: { id: order.id }, data: { status: "REFUNDED", paymentStatus: "REFUNDED" } });
  } else {
    updated = await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: "PARTIALLY_REFUNDED" } });
  }

  const email = await resolveCustomerEmail(order);
  if (email) {
    await bestEffort(() => sendRefundIssuedNotification(order.id, restaurantId, email, order.orderNumber, input.amountCents));
  }

  return updated;
}

async function resolveCustomerEmail(order: Order): Promise<string | undefined> {
  if (order.customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: order.customerId } });
    return customer?.email;
  }
  if (order.guestCustomerId) {
    const guest = await prisma.guestCustomer.findUnique({ where: { id: order.guestCustomerId } });
    return guest?.email;
  }
  return undefined;
}
