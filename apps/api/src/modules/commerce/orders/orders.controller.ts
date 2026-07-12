import type { Request, Response } from "express";
import { completeIdempotencyKey, failIdempotencyKey, reserveIdempotencyKey } from "../../../lib/idempotency";
import { prisma } from "../../../lib/prisma";
import { NoRestaurantError } from "../../restaurants/restaurant.errors";
import { getOwnRestaurantId } from "../../restaurants/restaurant.service";
import { RefundExceedsRemainingBalanceError, RefundFailedError } from "../payments/payments.errors";
import { InvalidOrderTransitionError } from "./order-state-machine";
import { OrderNotFoundError } from "./orders.errors";
import {
  cancelOrder,
  completeOrder,
  getOrderEvents,
  getOrderTimeline,
  getOwnOrder,
  listOrders,
  markOutForDelivery,
  markPaidCash,
  markReady,
  refundOrder,
  startPreparing,
} from "./orders.service";
import { cancelOrderSchema, listOrdersQuerySchema, refundOrderSchema } from "./orders.validation";

function paramId(req: Request): string {
  return req.params.id as string;
}

async function requireOwnRestaurantId(req: Request, res: Response): Promise<string | null> {
  const restaurantId = await getOwnRestaurantId(req.user!.id);
  if (!restaurantId) {
    res.status(404).json({ error: new NoRestaurantError().message });
    return null;
  }
  return restaurantId;
}

export async function listOrdersHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = listOrdersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  const { orders, total } = await listOrders(restaurantId, parsed.data);
  res.status(200).json({ orders, total, limit: parsed.data.limit, offset: parsed.data.offset });
}

export async function getOrderHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    res.status(200).json({ order: await getOwnOrder(restaurantId, paramId(req)) });
  } catch (err) {
    if (err instanceof OrderNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function getOrderEventsHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  try {
    res.status(200).json({ events: await getOrderEvents(restaurantId, paramId(req)) });
  } catch (err) {
    if (err instanceof OrderNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

/** Shared handler factory for the simple state-machine-transition actions (no request body). */
function transitionHandler(action: (restaurantId: string, orderId: string) => Promise<unknown>) {
  return async (req: Request, res: Response): Promise<void> => {
    const restaurantId = await requireOwnRestaurantId(req, res);
    if (!restaurantId) return;

    try {
      const order = await action(restaurantId, paramId(req));
      res.status(200).json({ order });
    } catch (err) {
      if (err instanceof OrderNotFoundError) {
        res.status(404).json({ error: err.message });
        return;
      }
      if (err instanceof InvalidOrderTransitionError) {
        res.status(409).json({ error: err.message });
        return;
      }
      throw err;
    }
  };
}

// Note: there is no separate "confirm" staff action — checkout.service.ts's
// placeOrder already transitions PENDING_PAYMENT -> CONFIRMED automatically
// the instant payment succeeds (or immediately for cash methods), since
// PENDING_PAYMENT's only meaning is "payment not yet resolved." Staff's
// first manual lifecycle action is startPreparing (CONFIRMED -> PREPARING).
export const startPreparingHandler = transitionHandler(startPreparing);
export const markReadyHandler = transitionHandler(markReady);
export const markOutForDeliveryHandler = transitionHandler(markOutForDelivery);
export const completeHandler = transitionHandler(completeOrder);

/**
 * Idempotency-key-guarded (Sprint 07.7 H-2) — a double-submitted mark-paid
 * click or a client retry after a dropped response must never write a
 * second Transaction row for the same cash charge. Mirrors
 * checkout.controller.ts's placeOrderHandler reserve/complete/fail
 * pattern.
 */
export async function markPaidHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const idempotencyKey = req.idempotencyKey!;
  const reservation = await reserveIdempotencyKey<{ order: unknown }>(idempotencyKey, "orders.markPaidCash");
  if (reservation.status === "completed") {
    res.status(200).json(reservation.response);
    return;
  }
  if (reservation.status === "in_progress") {
    res.status(409).json({ error: "This request is already being processed" });
    return;
  }

  try {
    const order = await markPaidCash(restaurantId, paramId(req));
    const response = { order };
    await completeIdempotencyKey(idempotencyKey, response);
    res.status(200).json(response);
  } catch (err) {
    await failIdempotencyKey(idempotencyKey);
    if (err instanceof OrderNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof InvalidOrderTransitionError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function cancelHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = cancelOrderSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  try {
    res.status(200).json({ order: await cancelOrder(restaurantId, paramId(req), parsed.data) });
  } catch (err) {
    if (err instanceof OrderNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof InvalidOrderTransitionError) {
      res.status(409).json({ error: err.message });
      return;
    }
    throw err;
  }
}

/**
 * Idempotency-key-guarded (Sprint 07.7 H-4) — a double-submitted refund
 * click or a client retry after a dropped response must never issue a
 * second real refund against the same payment. Mirrors
 * checkout.controller.ts's placeOrderHandler reserve/complete/fail
 * pattern.
 */
export async function refundHandler(req: Request, res: Response): Promise<void> {
  const restaurantId = await requireOwnRestaurantId(req, res);
  if (!restaurantId) return;

  const parsed = refundOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  const idempotencyKey = req.idempotencyKey!;
  const reservation = await reserveIdempotencyKey<{ order: unknown }>(idempotencyKey, "orders.refund");
  if (reservation.status === "completed") {
    res.status(200).json(reservation.response);
    return;
  }
  if (reservation.status === "in_progress") {
    res.status(409).json({ error: "This request is already being processed" });
    return;
  }

  try {
    const order = await refundOrder(restaurantId, paramId(req), parsed.data, req.user!.id);
    const response = { order };
    await completeIdempotencyKey(idempotencyKey, response);
    res.status(200).json(response);
  } catch (err) {
    await failIdempotencyKey(idempotencyKey);
    if (err instanceof OrderNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof InvalidOrderTransitionError) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof RefundExceedsRemainingBalanceError) {
      res.status(422).json({ error: err.message });
      return;
    }
    if (err instanceof RefundFailedError) {
      // The platform's own request was fine; the upstream provider
      // rejected the refund — never mapped to 200/success.
      res.status(502).json({ error: "The payment provider rejected this refund. Please try again or contact support." });
      return;
    }
    throw err;
  }
}

/** Public order tracking — no requireAuth. Guest lookup is order number + email/phone verification in a real implementation; Sprint 07 exposes lookup by orderId (an unguessable UUID) as the MVP mechanism. */
export async function publicGetOrderHandler(req: Request, res: Response): Promise<void> {
  try {
    const order = await prismaFindPublicOrder(paramId(req));
    res.status(200).json({ order });
  } catch (err) {
    if (err instanceof OrderNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

export async function publicGetOrderTimelineHandler(req: Request, res: Response): Promise<void> {
  try {
    res.status(200).json({ timeline: await getOrderTimeline(paramId(req)) });
  } catch (err) {
    if (err instanceof OrderNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    throw err;
  }
}

async function prismaFindPublicOrder(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!order) {
    throw new OrderNotFoundError();
  }
  return order;
}
