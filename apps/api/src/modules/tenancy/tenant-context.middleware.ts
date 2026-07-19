import type { NextFunction, Request, Response } from "express";
import { isTenantContextEnabled } from "../../config/env";
import { verifyAccessToken } from "../../lib/jwt";
import { createLogger } from "../../lib/logger";
import { ACCESS_TOKEN_COOKIE } from "../auth/cookies";
import { resolveTenantContext } from "./tenant-context";

/**
 * BOS Phase 0 (P0.2) — Tenant Context middleware (wiring only).
 *
 * Attaches `req.tenant` (via the P0.1 resolver) to requests that carry a valid
 * authenticated session, so later phases can read a single resolved tenant
 * scope. It is:
 *
 * - **Flag-guarded** — a no-op unless `TENANT_CONTEXT_ENABLED` is on
 *   (`isTenantContextEnabled()`), so mounting it is inert by default and
 *   flag-off behavior is exactly pre-P0.2.
 * - **Non-enforcing** — it never blocks or rejects a request. Every failure
 *   path (no cookie, invalid/expired token, resolution error) simply proceeds
 *   with no `req.tenant`. Per-route `requireAuth` remains the sole auth gate and
 *   is left completely untouched.
 * - **Read-only reuse** — it reuses the same `ACCESS_TOKEN_COOKIE` and
 *   `verifyAccessToken` primitives `requireAuth` uses, but only to *read* the
 *   session, never to gate it. It does not modify the JWT, cookies, or
 *   `req.user`.
 *
 * Mounted once in `app.ts` after `cookieParser()` and before route mounting.
 * No consumer reads `req.tenant` yet — that is P0.3, out of this PR's scope.
 */

const logger = createLogger("tenant-context-middleware");

export async function tenantContextMiddleware(req: Request, _res: Response, next: NextFunction): Promise<void> {
  // Flag off → exact pre-P0.2 behavior (single boolean check, no work).
  if (!isTenantContextEnabled()) {
    next();
    return;
  }

  try {
    const token = req.cookies?.[ACCESS_TOKEN_COOKIE];
    // Public/unauthenticated request — nothing to resolve.
    if (!token) {
      next();
      return;
    }

    const payload = verifyToken(token);
    // Invalid/expired token — not this middleware's job to reject (the
    // per-route requireAuth will, unchanged). Proceed with no req.tenant.
    if (!payload) {
      next();
      return;
    }

    // Do not overwrite an already-resolved context.
    if (!req.tenant) {
      req.tenant = await resolveTenantContext({ id: payload.sub, role: payload.role });
    }
    next();
  } catch (err) {
    // Absolute backstop: tenant resolution must never fail a request. The
    // resolver already never throws; this guards any unexpected error too.
    logger.debug({ err }, "tenant-context middleware: unexpected error; proceeding without req.tenant");
    next();
  }
}

/** Read-only token verification that returns null instead of throwing on an invalid/expired token. */
function verifyToken(token: string): ReturnType<typeof verifyAccessToken> | null {
  try {
    return verifyAccessToken(token);
  } catch {
    return null;
  }
}
