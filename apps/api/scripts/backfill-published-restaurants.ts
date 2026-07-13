/**
 * One-time backfill: `setSetupStep` only sets `isPublished: true` at the
 * moment a restaurant's setupStep transitions *to* DONE (restaurant.service.ts)
 * — any restaurant that had already reached DONE before that fix shipped has
 * no trigger that ever re-evaluates it, so it stays `isPublished: false`
 * forever. That's the exact cause of "Test order" showing "Restaurant not
 * found" for pre-existing accounts (public-menu.service.ts gates on
 * isPublished) even though the account finished onboarding successfully.
 *
 * Idempotent and safe to re-run: only touches rows that are actually
 * `setupStep: DONE` and `isPublished: false`; running it twice updates zero
 * rows the second time.
 *
 * Usage: pnpm --filter api exec tsx scripts/backfill-published-restaurants.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const result = await prisma.restaurant.updateMany({
    where: { setupStep: "DONE", isPublished: false },
    data: { isPublished: true },
  });
  console.log(`Backfilled isPublished=true for ${result.count} restaurant(s) already at setupStep DONE.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
