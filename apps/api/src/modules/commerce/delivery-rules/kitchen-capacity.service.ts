import { randomUUID } from "node:crypto";
import type { KitchenCapacity } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import type { UpdateKitchenCapacityInput } from "./kitchen-capacity.validation";

/**
 * Lazily creates the restaurant's KitchenCapacity singleton — defaults to
 * accepting orders, no caps configured. Production Hardening Phase 11
 * load testing found the original find-then-create pattern here raced
 * under concurrency, identical in shape to delivery-config.service.ts's
 * getConfig() — see that function's comment for the full explanation,
 * including why `prisma.kitchenCapacity.upsert()` was tried first and
 * confirmed by a real-concurrency regression test to still race in this
 * Prisma/driver-adapter combination. Fixed the same way: a genuinely
 * atomic raw SQL `INSERT ... ON CONFLICT ("restaurantId") DO UPDATE`.
 */
export async function getCapacity(restaurantId: string): Promise<KitchenCapacity> {
  const rows = await prisma.$queryRaw<KitchenCapacity[]>`
    INSERT INTO "KitchenCapacity"
      ("id", "restaurantId", "isAcceptingOrders", "createdAt", "updatedAt")
    VALUES
      (${randomUUID()}, ${restaurantId}, true, now(), now())
    ON CONFLICT ("restaurantId") DO UPDATE SET "restaurantId" = EXCLUDED."restaurantId"
    RETURNING *
  `;
  return rows[0];
}

export async function updateCapacity(
  restaurantId: string,
  input: UpdateKitchenCapacityInput,
): Promise<KitchenCapacity> {
  await getCapacity(restaurantId);
  return prisma.kitchenCapacity.update({ where: { restaurantId }, data: input });
}

/**
 * PURE — no DB access. `currentActiveOrderCount` is supplied by the
 * caller (the orders module counts CONFIRMED/PREPARING orders; this
 * module has no access to the Order table). False if manually paused,
 * false if a configured concurrent-order cap is reached, else true.
 */
export function isKitchenAvailable(capacity: KitchenCapacity, currentActiveOrderCount: number): boolean {
  if (!capacity.isAcceptingOrders) return false;
  if (capacity.maxConcurrentOrders !== null && currentActiveOrderCount >= capacity.maxConcurrentOrders) return false;
  return true;
}
