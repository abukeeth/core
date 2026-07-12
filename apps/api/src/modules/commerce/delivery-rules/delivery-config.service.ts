import { randomUUID } from "node:crypto";
import type { DeliveryConfig } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import type { UpdateDeliveryConfigInput } from "./delivery-config.validation";

/**
 * Sensible defaults for a brand-new restaurant: pickup enabled, delivery
 * and dine-in disabled until the owner opts in and configures the
 * economics (radius/fees/min order) that make delivery/dine-in safe to
 * turn on.
 */
const DEFAULT_CONFIG = {
  isDeliveryEnabled: false,
  isPickupEnabled: true,
  isDineInEnabled: false,
  minOrderCentsForDelivery: 0,
  minOrderCentsForPickup: 0,
} as const;

/**
 * Lazily creates the restaurant's DeliveryConfig singleton on first
 * access. Production Hardening Phase 11 load testing found the original
 * find-then-create pattern here raced under concurrency: two concurrent
 * first-ever requests for a brand-new restaurant could both observe "no
 * existing row" and both attempt create(), one losing to the
 * `restaurantId` unique constraint.
 *
 * The first fix attempted here was `prisma.deliveryConfig.upsert()` —
 * confirmed by a real-concurrency regression test to **still race**: this
 * Prisma/driver-adapter combination compiles `upsert()` to an explicit
 * transaction wrapping a `SELECT` then a conditional `INSERT`
 * (confirmed via Prisma query-event logging), not a native
 * `INSERT ... ON CONFLICT DO UPDATE` — i.e. the exact same check-then-act
 * race, just wrapped in `BEGIN`/`COMMIT`, which does not prevent it at
 * Postgres's default `READ COMMITTED` isolation. Fixed instead with a
 * genuinely atomic raw SQL `INSERT ... ON CONFLICT ("restaurantId") DO
 * UPDATE` — a single statement Postgres itself serializes at the row
 * level, with no ORM abstraction in between that could reintroduce a
 * two-step race. The `DO UPDATE SET "restaurantId" = EXCLUDED."restaurantId"`
 * is a no-op write (touches only the conflict-target column, back to its
 * own value) — its only purpose is making `RETURNING` produce the
 * existing row on conflict, since `DO NOTHING` returns nothing.
 */
export async function getConfig(restaurantId: string): Promise<DeliveryConfig> {
  const rows = await prisma.$queryRaw<DeliveryConfig[]>`
    INSERT INTO "DeliveryConfig"
      ("id", "restaurantId", "isDeliveryEnabled", "isPickupEnabled", "isDineInEnabled", "minOrderCentsForDelivery", "minOrderCentsForPickup", "createdAt", "updatedAt")
    VALUES
      (${randomUUID()}, ${restaurantId}, ${DEFAULT_CONFIG.isDeliveryEnabled}, ${DEFAULT_CONFIG.isPickupEnabled}, ${DEFAULT_CONFIG.isDineInEnabled}, ${DEFAULT_CONFIG.minOrderCentsForDelivery}, ${DEFAULT_CONFIG.minOrderCentsForPickup}, now(), now())
    ON CONFLICT ("restaurantId") DO UPDATE SET "restaurantId" = EXCLUDED."restaurantId"
    RETURNING *
  `;
  return rows[0];
}

export async function updateConfig(restaurantId: string, input: UpdateDeliveryConfigInput): Promise<DeliveryConfig> {
  await getConfig(restaurantId);
  return prisma.deliveryConfig.update({ where: { restaurantId }, data: input });
}
