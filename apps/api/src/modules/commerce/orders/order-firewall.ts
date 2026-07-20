import type { Request } from "express";
import { createLogger } from "../../../lib/logger";
import { evaluateFinancialFirewall } from "../../memberships/financial-firewall";

const logger = createLogger("kitchen-firewall");

/**
 * BOS Phase 2 (P2.6.1) — the single request-level decision for whether to redact
 * financial data from an order-bearing response. Shared by every REDACT surface
 * (order list/detail/events and the fulfillment my-assignments embed) so the
 * flag/predicate/observe-logging logic exists in exactly one place.
 *
 *   - enforce + restricted → returns true (caller redacts).
 *   - observe + restricted → logs a would-redact decision, returns false (NO
 *     access reduction).
 *   - off / no tenant / not restricted → returns false.
 */
export function shouldRedactOrderFinancials(req: Request, surface: string): boolean {
  const action = evaluateFinancialFirewall(req.tenant);
  if (action === "observe") {
    logger.info(
      { userId: req.user?.id, businessId: req.tenant?.businessId, surface },
      "kitchen firewall would redact order financials (observe mode)",
    );
  }
  return action === "enforce";
}
