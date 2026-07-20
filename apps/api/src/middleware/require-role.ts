import type { NextFunction, Request, Response } from "express";
import type { Role } from "@prisma/client";
import { isMembershipDualReadEnabled } from "../config/env";
import { membershipGrants } from "../modules/memberships/membership-authz";

export function requireRole(...allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    // Legacy authorization — authoritative, evaluated first, unchanged.
    if (allowed.includes(req.user.role)) {
      next();
      return;
    }

    // BOS Phase 2 (P2.5) — dual-read WIDEN branch. Additive and flag-gated
    // (MEMBERSHIP_DUAL_READ, default off; also requires req.tenant, which is
    // only populated when TENANT_CONTEXT_ENABLED is on). It can only GRANT: an
    // in-scope Membership whose role maps to one of the allowed legacy roles
    // lets the request through. It never denies — removing this block yields
    // exactly the legacy behavior. Scoped denials and the membership-primary
    // cutover are P2.6, not here.
    if (isMembershipDualReadEnabled() && req.tenant && membershipGrants(req.tenant, allowed)) {
      next();
      return;
    }

    res.status(403).json({ error: "Forbidden" });
  };
}
