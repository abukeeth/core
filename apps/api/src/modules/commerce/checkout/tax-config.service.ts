import type { Tax, TaxAppliesTo } from "@prisma/client";
import { prisma } from "../../../lib/prisma";

export interface SetSalesTaxInput {
  /** Human label for the rate's jurisdiction, e.g. "NY" or "Brooklyn, NY". */
  jurisdiction: string;
  /** Percentage, e.g. 8.875 for 8.875%. */
  ratePercent: number;
  /** Which part of the order the rate applies to. Defaults to ALL (food + delivery fee). */
  appliesTo?: TaxAppliesTo;
}

/**
 * Configure a restaurant's sales tax for the pilot: one flat rate for a given
 * basis. This is the operator-facing way to set tax without hand-writing SQL —
 * used from scripts/set-restaurant-tax.ts. Deliberately not a full owner-facing
 * tax-management UI: for a single-jurisdiction pilot a flat rate is correct and
 * sufficient, and multi-jurisdiction automation is Stripe Tax's job later
 * (docs/runbooks/sales-tax.md), so building CRUD UI now would be throwaway work.
 *
 * Idempotent: re-running replaces the existing rule for the SAME basis rather
 * than stacking a second one, so an operator can safely correct a rate. Rules
 * for other bases are left untouched.
 *
 * Rates are stored as integer basis points (0.01% precision). A rate finer than
 * 0.01% is rounded to the nearest 0.01% — negligible per order at pilot sizes,
 * and superseded by Stripe Tax's exact jurisdiction rates later.
 */
export async function setRestaurantSalesTax(restaurantId: string, input: SetSalesTaxInput): Promise<Tax> {
  if (!Number.isFinite(input.ratePercent) || input.ratePercent < 0 || input.ratePercent > 100) {
    throw new Error("ratePercent must be a number between 0 and 100");
  }
  if (!input.jurisdiction.trim()) {
    throw new Error("jurisdiction is required");
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { id: true } });
  if (!restaurant) {
    throw new Error(`No restaurant found with id ${restaurantId}`);
  }

  const appliesTo = input.appliesTo ?? "ALL";
  const rateBasisPoints = Math.round(input.ratePercent * 100);

  return prisma.$transaction(async (tx) => {
    await tx.tax.deleteMany({ where: { restaurantId, appliesTo } });
    return tx.tax.create({
      data: { restaurantId, jurisdiction: input.jurisdiction.trim(), rateBasisPoints, appliesTo, isActive: true },
    });
  });
}
