/**
 * Production Hardening Phase 11 — seeds the exact minimum data needed to
 * exercise the checkout hot path via real HTTP, then writes a manifest
 * the load-test runner (checkout-load-test.mjs) consumes.
 *
 * Deliberately targets the CASH_ON_DELIVERY/CASH_AT_PICKUP path
 * (checkout.service.ts's CASH_METHOD_TYPES branch calls confirmOrder()
 * directly, skipping the payment-provider orchestrator entirely) — this
 * is still the same write-contended core the master spec calls out
 * (idempotency-key reservation, the Order/OrderItem/Fulfillment
 * transaction, OutboxEvent writes), without needing a mocked or real
 * payment provider, which would be a second, unrelated variable in a
 * test whose whole point is measuring the checkout write path itself.
 *
 * Runs against whatever DATABASE_URL currently points at — the bash
 * orchestrator (run-load-test.sh) always points this at a fresh,
 * throwaway database (mirroring scripts/restore-drill.sh's pattern), so
 * this never touches real data and needs no cleanup logic of its own.
 *
 * Usage: RESTAURANT_COUNT=10 CARTS_PER_RESTAURANT=50 tsx seed-load-test-data.ts
 */
import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

// Same driver-adapter pattern as apps/api/src/lib/prisma.ts — Prisma 7's
// client requires an explicit adapter rather than reading DATABASE_URL
// implicitly.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
const prisma = new PrismaClient({ adapter });

const RESTAURANT_COUNT = Number(process.env.RESTAURANT_COUNT ?? 10);
const CARTS_PER_RESTAURANT = Number(process.env.CARTS_PER_RESTAURANT ?? 50);
const ITEM_PRICE_CENTS = 1_000;

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;

interface ManifestEntry {
  cartId: string;
  restaurantId: string;
  guestSessionId: string;
}

async function seedRestaurant(index: number): Promise<ManifestEntry[]> {
  const owner = await prisma.user.create({
    data: {
      email: `loadtest-owner-${index}-${randomUUID()}@example.test`,
      passwordHash: "not-a-real-hash-load-test-only",
      name: `Load Test Owner ${index}`,
      role: "RESTAURANT_OWNER",
    },
  });

  const restaurant = await prisma.restaurant.create({
    data: { ownerId: owner.id, name: `Load Test Restaurant ${index}`, isPublished: true },
  });

  // Always open, every day — the checkout quote engine's routing check
  // (evaluateRouting -> isRestaurantOpenAt) rejects a closed restaurant,
  // and this test cares about checkout write throughput, not hours logic.
  await prisma.restaurantHours.createMany({
    data: DAYS.map((dayOfWeek) => ({ restaurantId: restaurant.id, dayOfWeek, opensAt: 0, closesAt: 1439, isClosed: false })),
  });

  const category = await prisma.menuCategory.create({ data: { restaurantId: restaurant.id, name: "Mains" } });
  const item = await prisma.menuItem.create({
    data: { restaurantId: restaurant.id, categoryId: category.id, name: "Load Test Burger", priceCents: ITEM_PRICE_CENTS, isAvailable: true },
  });

  // Pre-warm the two known lazy-singleton-config races this same load
  // test discovered (delivery-config.service.ts's getConfig() and
  // kitchen-capacity.service.ts's getCapacity() — both find-then-create
  // with no unique-constraint-conflict handling, so N concurrent
  // first-ever requests for a brand-new restaurant can all attempt the
  // create() simultaneously). Pre-creating them here with the exact same
  // defaults those services use isolates the *other*, distinct finding
  // this test also surfaced — order-number generation racing under
  // concurrent same-restaurant checkouts — for cleaner measurement,
  // without fixing (or masking, in production) either bug. See
  // docs/reports/ProductionHardening/LOAD_TEST_RESULTS.md.
  await prisma.deliveryConfig.create({
    data: { restaurantId: restaurant.id, isDeliveryEnabled: false, isPickupEnabled: true, isDineInEnabled: false, minOrderCentsForDelivery: 0, minOrderCentsForPickup: 0 },
  });
  await prisma.kitchenCapacity.create({ data: { restaurantId: restaurant.id, isAcceptingOrders: true } });

  const carts = Array.from({ length: CARTS_PER_RESTAURANT }, () => ({
    id: randomUUID(),
    restaurantId: restaurant.id,
    guestSessionId: randomBytes(24).toString("base64url"),
    fulfillmentType: "PICKUP" as const,
    status: "ACTIVE" as const,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  }));
  await prisma.cart.createMany({ data: carts });
  await prisma.cartItem.createMany({
    data: carts.map((cart) => ({ cartId: cart.id, menuItemId: item.id, quantity: 1, unitPriceCents: ITEM_PRICE_CENTS })),
  });

  return carts.map((cart) => ({ cartId: cart.id, restaurantId: restaurant.id, guestSessionId: cart.guestSessionId }));
}

async function main() {
  const manifest: ManifestEntry[] = [];
  for (let i = 0; i < RESTAURANT_COUNT; i++) {
    manifest.push(...(await seedRestaurant(i)));
  }

  const manifestPath = path.join(import.meta.dirname, "manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest));
  console.log(`Seeded ${RESTAURANT_COUNT} restaurants, ${manifest.length} ready-to-checkout carts -> ${manifestPath}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
