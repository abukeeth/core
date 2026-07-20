import type { NextFunction, Request, Response } from "express";
import { createLogger } from "../lib/logger";
import { evaluateFinancialFirewall } from "../modules/memberships/financial-firewall";

const logger = createLogger("kitchen-firewall");

/**
 * BOS Phase 2 (P2.6.1) — kitchen financial firewall: endpoint denial.
 *
 * Denies a financially-restricted (kitchen) actor access to purely financial
 * endpoints (payment config, analytics/revenue, and the money-mutation order
 * actions mark-paid/refund). Mounted only on those routes (see the DENY set in
 * P2_6_1_EXECUTION_SPEC.md §2.3) — never on prep actions or the REDACT read
 * routes, which redact rather than deny.
 *
 * Behavior by KITCHEN_FIREWALL mode (via evaluateFinancialFirewall):
 *   - "allow"   → next() (flag off, no tenant, or actor not restricted).
 *   - "observe" → log a would-deny decision, then next() (NO access reduction).
 *   - "enforce" → 403.
 *
 * Distinct from require-role.ts: the P2.5 widen branch is untouched. This is an
 * additive deny layer so the firewall can be reasoned about and rolled back in
 * isolation. Mounted after requireAuth (needs the actor) and composes with the
 * tenant resolver (reads req.tenant).
 */
export function denyFinancialForKitchen(req: Request, res: Response, next: NextFunction): void {
  const action = evaluateFinancialFirewall(req.tenant);

  if (action === "enforce") {
    res.status(403).json({ error: "Financial data is not available for kitchen access" });
    return;
  }

  if (action === "observe") {
    logger.info(
      { userId: req.user?.id, businessId: req.tenant?.businessId, method: req.method, path: req.originalUrl },
      "kitchen firewall would deny financial endpoint (observe mode)",
    );
  }

  next();
}
