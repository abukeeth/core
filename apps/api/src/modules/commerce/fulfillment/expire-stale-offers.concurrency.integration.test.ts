import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../../lib/prisma";
import { expireStaleOffers } from "./fulfillment.service";

/**
 * Real-database concurrency test for Production Hardening Phase 6's
 * atomic claim-and-expire UPDATE (master spec Phase 6 Verification item
 * 1 — same requirement as outbox-worker's equivalent test, applied to
 * this job's different SQL shape: an `UPDATE ... FOR UPDATE SKIP LOCKED`
 * subquery rather than a held transaction).
 *
 * Deliberately NOT part of the default `pnpm test` run — see
 * outbox-worker.concurrency.integration.test.ts for the same rationale.
 * Run explicitly with a real Postgres available:
 *
 *   RUN_DB_INTEGRATION_TESTS=true pnpm --filter api exec vitest run \
 *     src/modules/commerce/fulfillment/expire-stale-offers.concurrency.integration.test.ts
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("expireStaleOffers — real-database concurrency (Production Hardening Phase 6)", () => {
  const restaurantId = randomUUID();
  const ownerId = randomUUID();
  const driverId = randomUUID();
  const fulfillmentIds: string[] = [];
  const assignmentIds: string[] = [];
  const orderIds: string[] = [];

  beforeAll(async () => {
    await prisma.user.create({
      data: { id: ownerId, email: `phase6-owner-${ownerId}@test.example`, passwordHash: "x", name: "Test Owner", role: "RESTAURANT_OWNER" },
    });
    await prisma.restaurant.create({
      data: { id: restaurantId, ownerId, name: "Phase 6 Concurrency Test Restaurant" },
    });
    await prisma.user.create({
      data: { id: driverId, email: `phase6-driver-${driverId}@test.example`, passwordHash: "x", name: "Test Driver", role: "RESTAURANT_STAFF", restaurantId },
    });

    const N = 8;
    const past = new Date(Date.now() - 60_000);
    for (let i = 0; i < N; i++) {
      const orderId = randomUUID();
      const fulfillmentId = randomUUID();
      const assignmentId = randomUUID();
      await prisma.order.create({
        data: {
          id: orderId,
          orderNumber: i + 1,
          restaurantId,
          fulfillmentType: "DELIVERY",
          subtotalCents: 1000,
          totalCents: 1000,
        },
      });
      await prisma.fulfillment.create({
        data: { id: fulfillmentId, orderId, restaurantId, method: "RESTAURANT_DRIVER", status: "ASSIGNED" },
      });
      await prisma.driverAssignment.create({
        data: { id: assignmentId, fulfillmentId, driverId, status: "OFFERED", offerExpiresAt: past },
      });
      orderIds.push(orderId);
      fulfillmentIds.push(fulfillmentId);
      assignmentIds.push(assignmentId);
    }
  });

  afterAll(async () => {
    await prisma.driverAssignment.deleteMany({ where: { id: { in: assignmentIds } } });
    await prisma.fulfillment.deleteMany({ where: { id: { in: fulfillmentIds } } });
    // expireStaleOffers's writeOrderEvent call creates an OrderEvent (FK'd
    // to Order) and an OutboxEvent per expired row — both must go before
    // the Orders they reference.
    await prisma.orderEvent.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.outboxEvent.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [driverId] } } });
    await prisma.restaurant.deleteMany({ where: { id: restaurantId } });
    await prisma.user.deleteMany({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it("two concurrent sweeps together expire every stale offer exactly once — none skipped, none double-expired", async () => {
    const [resultA, resultB] = await Promise.all([expireStaleOffers(), expireStaleOffers()]);

    // No offer silently skipped: every seeded assignment is now EXPIRED.
    const rows = await prisma.driverAssignment.findMany({ where: { id: { in: assignmentIds } } });
    expect(rows).toHaveLength(assignmentIds.length);
    expect(rows.every((r) => r.status === "EXPIRED")).toBe(true);

    // No double-expiry: the two concurrent sweeps' expiredCounts are
    // disjoint (SKIP LOCKED partitions the rows between them) and sum to
    // exactly the seeded count — not more, which is what would happen if
    // both sweeps claimed and counted the same row.
    expect(resultA.expiredCount + resultB.expiredCount).toBe(assignmentIds.length);
  });
});
