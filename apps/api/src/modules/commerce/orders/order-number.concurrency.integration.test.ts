import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../../lib/prisma";
import { nextOrderNumber } from "./order-number";

/**
 * Real-database concurrency test proving the order-number generation
 * race Production Hardening Phase 11's load testing found is now closed
 * (release-blocker fix: `order-number.ts`'s `pg_advisory_xact_lock`).
 * Mirrors `outbox-worker.concurrency.integration.test.ts`'s pattern: a
 * live Postgres, N concurrent callers, asserting no duplicate/skipped
 * outcome — here, N concurrent same-restaurant "reserve a number, then
 * insert the Order" transactions (the exact shape checkout.service.ts
 * uses) all succeed with N distinct, gapless order numbers and zero
 * unique-constraint failures.
 *
 * Deliberately NOT part of the default `pnpm test` run — gated behind
 * RUN_DB_INTEGRATION_TESTS, same convention as every other real-database
 * test in this codebase. Run explicitly with a real Postgres available:
 *
 *   RUN_DB_INTEGRATION_TESTS=true pnpm --filter api exec vitest run \
 *     src/modules/commerce/orders/order-number.concurrency.integration.test.ts
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("nextOrderNumber — real-database concurrency (Production Hardening release-blocker fix)", () => {
  let restaurantId: string;
  let ownerId: string;

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: {
        email: `order-number-race-test-${randomUUID()}@example.test`,
        passwordHash: "not-a-real-hash",
        name: "Order Number Race Test Owner",
        role: "RESTAURANT_OWNER",
      },
    });
    ownerId = owner.id;
    const restaurant = await prisma.restaurant.create({
      data: { ownerId: owner.id, name: "Order Number Race Test Restaurant" },
    });
    restaurantId = restaurant.id;
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { restaurantId } });
    await prisma.restaurant.delete({ where: { id: restaurantId } });
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it("N concurrent same-restaurant checkouts each get a distinct order number, with zero unique-constraint failures", async () => {
    const N = 20;

    const results = await Promise.allSettled(
      Array.from({ length: N }, () =>
        prisma.$transaction(async (tx) => {
          const orderNumber = await nextOrderNumber(tx, restaurantId);
          return tx.order.create({
            data: {
              orderNumber,
              restaurantId,
              fulfillmentType: "PICKUP",
              subtotalCents: 1000,
              totalCents: 1000,
            },
          });
        }),
      ),
    );

    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(0);

    const orders = await prisma.order.findMany({ where: { restaurantId }, select: { orderNumber: true } });
    const orderNumbers = orders.map((o) => o.orderNumber).sort((a, b) => a - b);

    // Exactly N orders created, every orderNumber distinct (no duplicate
    // slipped past the fixed race), and gapless 1..N (proves no wasted/
    // skipped number either -- the lock serializes cleanly rather than
    // causing retries that burn numbers).
    expect(orderNumbers).toHaveLength(N);
    expect(new Set(orderNumbers).size).toBe(N);
    expect(orderNumbers).toEqual(Array.from({ length: N }, (_, i) => i + 1));
  });
});
