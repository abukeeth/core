import type { Tax } from "@prisma/client";

const BASIS_POINTS_DIVISOR = 10_000;

/**
 * PURE — no DB access. Sums every active Tax rule against the portion of
 * the order it applies to (FOOD -> subtotal, DELIVERY_FEE -> delivery
 * fee, ALL -> both). Order.taxCents is the frozen result, never
 * recalculated retroactively if a Tax rule changes later.
 */
export function computeTaxCents(taxRules: Tax[], subtotalCents: number, deliveryFeeCents: number): number {
  return taxRules
    .filter((rule) => rule.isActive)
    .reduce((total, rule) => {
      const base =
        rule.appliesTo === "FOOD" ? subtotalCents : rule.appliesTo === "DELIVERY_FEE" ? deliveryFeeCents : subtotalCents + deliveryFeeCents;
      return total + Math.round((base * rule.rateBasisPoints) / BASIS_POINTS_DIVISOR);
    }, 0);
}
