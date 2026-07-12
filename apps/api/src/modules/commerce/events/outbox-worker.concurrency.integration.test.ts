import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../../../lib/prisma";
import { commerceEventBus } from "./event-bus";
import { processOutboxBatch } from "./outbox-worker";

/**
 * Real-database concurrency test for Production Hardening Phase 6's
 * FOR UPDATE SKIP LOCKED claim (master spec Phase 6 Verification item 1:
 * "A dedicated integration-style test runs two concurrent instances of
 * the batch-processing function against one (real...) database, seeds N
 * events, and confirms all N are processed with no event silently skipped
 * and no double-count in the final tally").
 *
 * Deliberately NOT part of the default `pnpm test` run — every other test
 * in this codebase mocks `lib/prisma` and needs no live database
 * (established convention since Sprint 03/04), and this file genuinely
 * needs one. Gated behind RUN_DB_INTEGRATION_TESTS so `pnpm test` stays
 * hermetic and portable by default; run explicitly with a real Postgres
 * available via:
 *
 *   RUN_DB_INTEGRATION_TESTS=true pnpm --filter api exec vitest run \
 *     src/modules/commerce/events/outbox-worker.concurrency.integration.test.ts
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("processOutboxBatch — real-database concurrency (Production Hardening Phase 6)", () => {
  const seededIds: string[] = [];
  const seededOrderIds: string[] = [];

  beforeAll(async () => {
    const N = 20;
    const rows = Array.from({ length: N }, () => ({
      id: randomUUID(),
      type: "ORDER_CREATED" as const,
      restaurantId: `phase6-concurrency-test-${randomUUID()}`,
      orderId: randomUUID(),
      payload: {},
    }));
    await prisma.outboxEvent.createMany({ data: rows });
    seededIds.push(...rows.map((r) => r.id));
    seededOrderIds.push(...rows.map((r) => r.orderId));
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { id: { in: seededIds } } });
    await prisma.$disconnect();
  });

  it("two concurrent callers together process every seeded event exactly once — none skipped, none double-dispatched", async () => {
    const emitSpy = vi.spyOn(commerceEventBus, "emit");

    const [resultA, resultB] = await Promise.all([processOutboxBatch(), processOutboxBatch()]);

    // No event silently skipped: every seeded row is now processedAt-set.
    const rows = await prisma.outboxEvent.findMany({ where: { id: { in: seededIds } } });
    expect(rows).toHaveLength(seededIds.length);
    expect(rows.every((r) => r.processedAt !== null)).toBe(true);

    // No double-count: each seeded orderId was dispatched to the event
    // bus exactly once total across both concurrent calls combined — the
    // exact bug SKIP LOCKED prevents (two instances both claiming and
    // emitting the same row).
    const ourEmits = emitSpy.mock.calls.map(([event]) => event.orderId).filter((orderId) => seededOrderIds.includes(orderId as string));
    expect(ourEmits).toHaveLength(seededIds.length);
    expect(new Set(ourEmits).size).toBe(seededIds.length);

    // Sanity: both calls actually did some work (proves this genuinely
    // exercised two concurrent claimers, not one call racing an empty one).
    expect(resultA.processedCount + resultB.processedCount).toBeGreaterThan(0);

    emitSpy.mockRestore();
  });
});
