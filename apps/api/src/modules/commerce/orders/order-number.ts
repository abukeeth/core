import type { Prisma } from "@prisma/client";

/**
 * Sequential per-restaurant order number (not global) — must run inside
 * the same transaction that creates the Order row.
 *
 * Production Hardening Phase 11 load testing found that being "inside
 * the same transaction" alone does not prevent the race this function's
 * read (MAX+1) and the caller's later insert are exposed to: at
 * Postgres's default READ COMMITTED isolation (this transaction is only
 * elevated to Serializable when a coupon is present — checkout.service.ts),
 * two concurrent placeOrder calls for the *same restaurant* can both read
 * the same "last" order number before either commits, and one loses to
 * the `(restaurantId, orderNumber)` unique constraint at insert time.
 *
 * Fixed with a transaction-scoped Postgres advisory lock keyed by a hash
 * of the restaurantId: the first concurrent caller for a given restaurant
 * acquires it and proceeds; every other concurrent caller for that same
 * restaurant blocks until the lock holder's transaction commits or rolls
 * back (pg_advisory_xact_lock auto-releases then — no separate unlock
 * call is needed or correct here). Callers for *different* restaurants
 * hash to (almost certainly) different lock keys and never block each
 * other, so this doesn't serialize checkout across the whole platform,
 * only within one restaurant's own concurrent checkouts — exactly the
 * scope of the actual race.
 */
export async function nextOrderNumber(tx: Prisma.TransactionClient, restaurantId: string): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${restaurantId}, 0))`;

  const last = await tx.order.findFirst({
    where: { restaurantId },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  return (last?.orderNumber ?? 0) + 1;
}
