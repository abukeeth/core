import type { OrderEventType } from "@prisma/client";

/**
 * The event catalog is the Prisma OrderEventType enum itself — one source
 * of truth for both the persisted OrderEvent.type column and the in-process
 * event bus, so the two can never drift apart.
 */
export interface CommerceEvent<T = Record<string, unknown>> {
  type: OrderEventType;
  restaurantId: string;
  orderId?: string;
  payload?: T;
}
