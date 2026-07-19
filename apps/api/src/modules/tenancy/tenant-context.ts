import type { Role } from "@prisma/client";
import { createLogger } from "../../lib/logger";
import { getOrganizationIdForBusiness } from "../organizations/organization.service";
import { getOwnRestaurantId } from "../restaurants/restaurant.service";

/**
 * BOS Phase 0 (P0) — Tenant Context.
 *
 * A `TenantContext` is the *resolved runtime identity* of a request: which
 * tenant it acts within and what the actor's role is there. This is the single
 * seam every later BOS phase reads and writes through (Organization → Business
 * → Location, Membership, Capabilities), so it is introduced now — before any
 * of those entities exist — with the future fields reserved but unpopulated.
 *
 * In P0 the context is purely *descriptive*: it does not grant or deny anything
 * (authorization still lives in requireRole / service-level ownership checks).
 * `businessId` is defined as EXACTLY today's resolved restaurant — the same
 * value `getOwnRestaurantId(userId)` returns — so it is a strict superset of
 * current behavior and never a new scoping path. See P0_EXECUTION_SPEC.md and
 * PR_P0_1_IMPLEMENTATION_PLAN.md.
 *
 * PR-P0.1 scope: this module is a pure, unit-tested building block. Nothing
 * mounts it or reads `req.tenant` yet — wiring is PR-P0.2, consumption is
 * PR-P0.3, both out of this PR's scope.
 */

const logger = createLogger("tenant-context");

/**
 * Reserved for P2 (Membership). Left intentionally opaque in P0 so this module
 * takes no dependency on a Membership entity that does not exist yet.
 */
export type TenantMembership = unknown;

/**
 * Reserved for P3 (Capabilities). An empty set in P0 — `Record<string, never>`
 * means "no capabilities are modeled yet," not "no capabilities." Tightened in
 * P3.
 */
export type TenantCapabilities = Record<string, never>;

/** How the context's `businessId` was resolved. Always the legacy path in P0. */
export type TenantContextSource = "legacy-user-restaurant";

export interface TenantContext {
  /**
   * P0: the Business scope key — equal to the authenticated user's
   * `restaurantId` (via `getOwnRestaurantId`). `null` when the user has no
   * business yet (e.g. an owner mid-onboarding, a fresh admin). The physical
   * column remains `restaurantId`; "businessId" is the BOS-level name for it.
   */
  businessId: string | null;
  /** P0: the actor's role, passed through from `req.user.role`. */
  role: Role | null;

  // --- Reserved slots: declared in P0, populated in later phases, read by
  // nothing in P0. ---
  /** P1 (Organization layer). */
  organizationId: string | null;
  /** P4 (default Location). */
  locationId: string | null;
  /** P2 (Membership). Empty in P0. */
  memberships: TenantMembership[];
  /** P3 (Capabilities). Empty in P0. */
  capabilities: TenantCapabilities;

  /** Provenance for telemetry/debugging — not used for authorization. */
  resolvedFrom: TenantContextSource;
}

/** The minimal authenticated-user shape the resolver needs (matches `req.user`). */
export interface TenantContextUser {
  id: string;
  role: Role;
}

/**
 * Injectable dependencies, so the resolver is unit-testable without a database.
 * Defaults bind to the real, existing lookup (`getOwnRestaurantId`).
 */
export interface ResolveTenantContextDeps {
  getBusinessIdForUser?: (userId: string) => Promise<string | null>;
  getOrganizationIdForBusiness?: (businessId: string) => Promise<string | null>;
}

/**
 * Pure resolver: given the authenticated user (or `undefined` for a
 * public/unauthenticated request), produce the request's `TenantContext`.
 *
 * - No user → `undefined` (nothing to attach).
 * - Never throws: a business- or organization-lookup failure logs a warning and
 *   resolves that field to `null`, so a request that succeeds today can never
 *   fail because of this seam.
 * - Reads the business at most once, and the organization at most once (only
 *   when a business resolved).
 */
export async function resolveTenantContext(
  user: TenantContextUser | undefined,
  deps: ResolveTenantContextDeps = {},
): Promise<TenantContext | undefined> {
  if (!user) return undefined;

  const businessLookup = deps.getBusinessIdForUser ?? getOwnRestaurantId;
  const organizationLookup = deps.getOrganizationIdForBusiness ?? getOrganizationIdForBusiness;

  let businessId: string | null = null;
  try {
    businessId = await businessLookup(user.id);
  } catch (err) {
    logger.warn(
      { err, userId: user.id },
      "tenant-context: business lookup failed; resolving businessId=null (behavior unchanged)",
    );
    businessId = null;
  }

  // BOS Phase 1 (P1.3) — populate the Organization that owns this Business.
  // Only attempted when a business resolved; never throws (organizationId stays
  // null on any failure). Nothing consumes organizationId yet, so this changes
  // no observable behavior — it establishes the value for later phases.
  let organizationId: string | null = null;
  if (businessId) {
    try {
      organizationId = (await organizationLookup(businessId)) ?? null;
    } catch (err) {
      logger.warn(
        { err, businessId },
        "tenant-context: organization lookup failed; resolving organizationId=null (behavior unchanged)",
      );
      organizationId = null;
    }
  }

  return {
    businessId,
    role: user.role,
    organizationId,
    locationId: null,
    memberships: [],
    capabilities: {},
    resolvedFrom: "legacy-user-restaurant",
  };
}

// Express `Request` augmentation. Follows the repo's co-located convention
// (see middleware/require-auth.ts, require-idempotency-key.ts,
// commerce/customers/require-customer-auth.ts): the augmentation lives with the
// module that owns the property. `tenant` is optional — it is present only on
// authenticated requests once the resolver is mounted (PR-P0.2); in PR-P0.1
// nothing attaches it.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenant?: TenantContext;
    }
  }
}
