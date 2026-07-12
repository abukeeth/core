import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "../../../lib/prisma";
import { getConfig } from "./delivery-config.service";
import { getCapacity } from "./kitchen-capacity.service";

/**
 * Real-database concurrency test proving the lazy-singleton-config race
 * Production Hardening Phase 11's load testing found is now closed
 * (release-blocker fix: `getConfig`/`getCapacity` now use a single atomic
 * `upsert` instead of find-then-create). Mirrors
 * `outbox-worker.concurrency.integration.test.ts`'s pattern: a live
 * Postgres, N concurrent first-ever callers for the same brand-new
 * restaurant, asserting every call succeeds and exactly one row exists
 * afterward — the exact scenario that previously threw a `P2002`
 * (`UniqueConstraintViolation`) under load.
 *
 * Deliberately NOT part of the default `pnpm test` run — gated behind
 * RUN_DB_INTEGRATION_TESTS, same convention as every other real-database
 * test in this codebase. Run explicitly with a real Postgres available:
 *
 *   RUN_DB_INTEGRATION_TESTS=true pnpm --filter api exec vitest run \
 *     src/modules/commerce/delivery-rules/config-singleton.concurrency.integration.test.ts
 */
const RUN = process.env.RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!RUN)("getConfig / getCapacity — real-database concurrency (Production Hardening release-blocker fix)", () => {
  let restaurantId: string;
  let ownerId: string;

  beforeAll(async () => {
    const owner = await prisma.user.create({
      data: {
        email: `config-singleton-race-test-${randomUUID()}@example.test`,
        passwordHash: "not-a-real-hash",
        name: "Config Singleton Race Test Owner",
        role: "RESTAURANT_OWNER",
      },
    });
    ownerId = owner.id;
    const restaurant = await prisma.restaurant.create({
      data: { ownerId: owner.id, name: "Config Singleton Race Test Restaurant" },
    });
    restaurantId = restaurant.id;
  });

  afterAll(async () => {
    await prisma.deliveryConfig.deleteMany({ where: { restaurantId } });
    await prisma.kitchenCapacity.deleteMany({ where: { restaurantId } });
    await prisma.restaurant.delete({ where: { id: restaurantId } });
    await prisma.user.delete({ where: { id: ownerId } });
    await prisma.$disconnect();
  });

  it("N concurrent first-ever getConfig() calls for the same brand-new restaurant all succeed, with exactly one DeliveryConfig row created", async () => {
    const N = 20;

    const results = await Promise.allSettled(Array.from({ length: N }, () => getConfig(restaurantId)));

    expect(results.filter((r) => r.status === "rejected")).toHaveLength(0);

    const rows = await prisma.deliveryConfig.findMany({ where: { restaurantId } });
    expect(rows).toHaveLength(1);
  });

  it("N concurrent first-ever getCapacity() calls for the same brand-new restaurant all succeed, with exactly one KitchenCapacity row created", async () => {
    const N = 20;

    const results = await Promise.allSettled(Array.from({ length: N }, () => getCapacity(restaurantId)));

    expect(results.filter((r) => r.status === "rejected")).toHaveLength(0);

    const rows = await prisma.kitchenCapacity.findMany({ where: { restaurantId } });
    expect(rows).toHaveLength(1);
  });
});
