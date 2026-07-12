import type { OrderStatus } from "@prisma/client";

export class InvalidOrderTransitionError extends Error {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Cannot transition order from ${from} to ${to}`);
  }
}

/**
 * The single centralized valid-transition table (Sprint 07 spec §10). No
 * code outside this module is permitted to decide whether an Order.status
 * change is legal — orders.service calls assertValidTransition before
 * every write to this column.
 */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["CONFIRMED", "FAILED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED", "REFUNDED"],
  PREPARING: ["READY", "OUT_FOR_DELIVERY", "CANCELLED", "REFUNDED"],
  READY: ["COMPLETED", "CANCELLED", "REFUNDED"],
  OUT_FOR_DELIVERY: ["COMPLETED", "CANCELLED", "REFUNDED"],
  COMPLETED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
  FAILED: [],
};

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertValidOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrderStatus(from, to)) {
    throw new InvalidOrderTransitionError(from, to);
  }
}
