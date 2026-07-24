/**
 * Configure a restaurant's pilot sales-tax rate.
 *
 * Usage:
 *   pnpm --filter api exec tsx scripts/set-restaurant-tax.ts <restaurantId> <ratePercent> <jurisdiction> [FOOD|DELIVERY_FEE|ALL]
 *
 * Example (New York City combined rate on the whole order):
 *   ... set-restaurant-tax.ts 0c3f... 8.875 "New York, NY" ALL
 *
 * Idempotent — re-running replaces the rule for the same basis. See
 * docs/runbooks/sales-tax.md.
 */
import type { TaxAppliesTo } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { setRestaurantSalesTax } from "../src/modules/commerce/checkout/tax-config.service";

const VALID_BASES: TaxAppliesTo[] = ["FOOD", "DELIVERY_FEE", "ALL"];

async function main(): Promise<void> {
  const [restaurantId, ratePercentRaw, jurisdiction, appliesToRaw] = process.argv.slice(2);
  if (!restaurantId || !ratePercentRaw || !jurisdiction) {
    console.error(
      "Usage: tsx scripts/set-restaurant-tax.ts <restaurantId> <ratePercent> <jurisdiction> [FOOD|DELIVERY_FEE|ALL]",
    );
    process.exitCode = 1;
    return;
  }

  const ratePercent = Number(ratePercentRaw);
  const appliesTo = (appliesToRaw as TaxAppliesTo | undefined) ?? "ALL";
  if (appliesToRaw && !VALID_BASES.includes(appliesTo)) {
    console.error(`Invalid basis "${appliesToRaw}". Must be one of: ${VALID_BASES.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const tax = await setRestaurantSalesTax(restaurantId, { jurisdiction, ratePercent, appliesTo });
  console.log(
    `Set ${jurisdiction} sales tax ${ratePercent}% (${tax.rateBasisPoints} basis points, appliesTo=${tax.appliesTo}) for restaurant ${restaurantId}`,
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
