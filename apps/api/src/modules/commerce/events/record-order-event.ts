import type { OrderEventActorType, OrderEventType, Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { commerceEventBus } from "./event-bus";

export interface OrderEventInput {
  orderId: string;
  restaurantId: string;
  type: OrderEventType;
  actorType?: OrderEventActorType;
  actorId?: string;
  payload?: Record<string, unknown>;
}

/** Writes the durable, append-only OrderEvent row, plus a durable
 * OutboxEvent staging row in the same transaction (Sprint 07.7 H-11) — the
 * latter is what gives the in-process commerceEventBus at-least-once
 * delivery surviving a process crash; outbox-worker.ts drains it. Safe to
 * call inside a `$transaction` callback by passing its `tx` client — both
 * writes then commit or roll back atomically with the state change they
 * record. */
export async function writeOrderEvent(input: OrderEventInput, tx: Prisma.TransactionClient = prisma): Promise<void> {
  await tx.orderEvent.create({
    data: {
      orderId: input.orderId,
      type: input.type,
      actorType: input.actorType ?? "SYSTEM",
      actorId: input.actorId,
      payload: input.payload as Prisma.InputJsonValue | undefined,
    },
  });
  await tx.outboxEvent.create({
    data: {
      type: input.type,
      restaurantId: input.restaurantId,
      orderId: input.orderId,
      payload: input.payload as Prisma.InputJsonValue | undefined,
    },
  });
}

/** Emits on the in-process event bus. Callers inside a transaction must call
 * this only AFTER the transaction has committed — never before, to avoid
 * emitting for a write that gets rolled back. */
export function emitOrderEvent(input: OrderEventInput): void {
  commerceEventBus.emit({
    type: input.type,
    restaurantId: input.restaurantId,
    orderId: input.orderId,
    payload: input.payload,
  });
}

/**
 * Convenience for the common non-transactional case: writes the event row
 * and emits immediately, since a write against the default `prisma` client
 * (no explicit `tx`) already commits on its own. Do NOT use this from
 * inside a `$transaction` callback — use `writeOrderEvent(input, tx)` there
 * and call `emitOrderEvent(input)` yourself once the transaction resolves.
 */
export async function recordOrderEvent(input: OrderEventInput): Promise<void> {
  await writeOrderEvent(input);
  emitOrderEvent(input);
}
