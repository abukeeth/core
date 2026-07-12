import type { OutboxEvent, Prisma } from "@prisma/client";
import { errorTracker } from "../../../lib/error-tracker";
import { createLogger } from "../../../lib/logger";
import { prisma } from "../../../lib/prisma";
import { commerceEventBus } from "./event-bus";

const BATCH_SIZE = 50;
const logger = createLogger("outbox-worker");

/**
 * Drains a batch of unprocessed OutboxEvent rows, dispatching each to the
 * in-process commerceEventBus and marking it processedAt on success (Sprint
 * 07.7 H-11). This is the durable path in front of the bus's own
 * process-local EventEmitter — it changes how reliably an event reaches the
 * bus, not the bus's own public interface.
 *
 * Delivery is at-least-once, not exactly-once: a crash between dispatch and
 * marking processedAt would redeliver on the next poll. Any real subscriber
 * built on top of this must be idempotent, consistent with this codebase's
 * existing idempotency-key discipline elsewhere.
 *
 * Multi-instance-safe as of Production Hardening Phase 6: the claiming
 * SELECT below uses `FOR UPDATE SKIP LOCKED` inside a transaction, so
 * concurrently-polling instances each lock a disjoint set of rows instead
 * of racing over the same ones — a second instance's identical query
 * simply skips whatever this one already has locked and claims the next
 * available rows instead. The lock is held for the entire transaction,
 * spanning the dispatch loop below, not just the SELECT itself: releasing
 * it early (e.g. by committing right after the SELECT, in a separate
 * transaction from the dispatch+update) would let a second instance
 * re-claim and double-dispatch the same row while this one is still
 * processing it. This is safe to hold open across the loop specifically
 * because commerceEventBus.emit() is synchronous and fire-and-forget
 * (event-bus.ts) — the transaction is never left open across real I/O.
 */
export async function processOutboxBatch(): Promise<{ processedCount: number }> {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<OutboxEvent[]>`
      SELECT * FROM "OutboxEvent"
      WHERE "processedAt" IS NULL
      ORDER BY "createdAt" ASC
      LIMIT ${BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    `;

    let processedCount = 0;
    for (const row of rows) {
      if (await dispatchOne(tx, row)) {
        processedCount++;
      }
    }
    return { processedCount };
  });
}

async function dispatchOne(tx: Prisma.TransactionClient, row: OutboxEvent): Promise<boolean> {
  try {
    commerceEventBus.emit({
      type: row.type,
      restaurantId: row.restaurantId,
      orderId: row.orderId ?? undefined,
      payload: row.payload as Record<string, unknown> | undefined,
    });
    await tx.outboxEvent.update({ where: { id: row.id }, data: { processedAt: new Date() } });
    return true;
  } catch (err) {
    // Left unprocessed — picked up again on the next poll (at-least-once).
    logger.error({ err, outboxEventId: row.id }, "outbox-worker: failed to dispatch event");
    errorTracker.captureException(err, { outboxEventId: row.id });
    return false;
  }
}
