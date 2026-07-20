import { MembershipRole, MembershipScope, Role } from "@prisma/client";
import type { TenantContext, TenantMembership } from "../tenancy/tenant-context";

/**
 * BOS Phase 2 (P2.5) — dual-read authorization helpers (pure, side-effect-free).
 *
 * These answer one question for the `requireRole` WIDEN branch: "does the actor
 * hold an in-scope Membership that maps to one of the legacy roles this route
 * allows?" They can only ever contribute a GRANT — the legacy role check remains
 * authoritative and is evaluated first in `requireRole`. Scoped denials and the
 * membership-primary cutover are P2.6, not here.
 */

/**
 * 1:1 mapping from a scoped MembershipRole to its legacy `Role` equivalent, so a
 * membership is treated exactly as-if the actor held the corresponding legacy
 * role — preserving legacy granularity (STAFF never satisfies an owner-only
 * route). Roles with no legacy equivalent (MANAGER/KITCHEN/MARKETING/SUPPORT)
 * map to `null` and therefore grant nothing in P2.5; their real semantics arrive
 * with the P2.6 cutover / P3.
 */
const LEGACY_ROLE_EQUIVALENT: Record<MembershipRole, Role | null> = {
  [MembershipRole.OWNER]: Role.RESTAURANT_OWNER,
  [MembershipRole.STAFF]: Role.RESTAURANT_STAFF,
  [MembershipRole.ADMIN]: Role.ADMIN,
  [MembershipRole.MANAGER]: null,
  [MembershipRole.KITCHEN]: null,
  [MembershipRole.MARKETING]: null,
  [MembershipRole.SUPPORT]: null,
};

/** True if a membership's role maps to one of the route's allowed legacy roles. */
export function membershipRoleSatisfies(role: MembershipRole, allowed: readonly Role[]): boolean {
  const legacy = LEGACY_ROLE_EQUIVALENT[role];
  return legacy !== null && allowed.includes(legacy);
}

/**
 * True if a membership applies to the request's tenant scope: a BUSINESS-scoped
 * membership matching `tenant.businessId`, or an ORGANIZATION-scoped membership
 * matching `tenant.organizationId` (org-scope implies its businesses). LOCATION
 * scope is not honored in P2.5 (the Location entity arrives in P4). A membership
 * for a different business/org — or when the tenant has no business/org context
 * — does not match.
 */
export function membershipInScope(membership: TenantMembership, tenant: TenantContext): boolean {
  if (membership.scopeType === MembershipScope.BUSINESS) {
    return tenant.businessId !== null && membership.scopeId === tenant.businessId;
  }
  if (membership.scopeType === MembershipScope.ORGANIZATION) {
    return tenant.organizationId !== null && membership.scopeId === tenant.organizationId;
  }
  return false;
}

/**
 * The WIDEN predicate: true if any of the actor's memberships is both in scope
 * and role-equivalent to one of the allowed legacy roles. Never denies — the
 * caller uses this only to add a grant path after the legacy check.
 */
export function membershipGrants(tenant: TenantContext, allowed: readonly Role[]): boolean {
  return tenant.memberships.some(
    (membership) => membershipInScope(membership, tenant) && membershipRoleSatisfies(membership.role, allowed),
  );
}
