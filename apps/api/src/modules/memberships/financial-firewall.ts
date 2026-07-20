import { MembershipRole } from "@prisma/client";
import { getKitchenFirewallMode, type KitchenFirewallMode } from "../../config/env";
import type { TenantContext } from "../tenancy/tenant-context";
import { membershipInScope } from "./membership-authz";

/**
 * BOS Phase 2 (P2.6.1) — kitchen financial firewall.
 *
 * The membership roles that legitimately see money. If the actor holds any of
 * these IN SCOPE, they are NOT financially restricted — even if they also hold a
 * KITCHEN membership. This is the clause that guarantees an OWNER (or a
 * manager/cashier who happens to also cover the line) is never over-blocked.
 */
export const MONEY_AUTHORIZED_MEMBERSHIP_ROLES: readonly MembershipRole[] = [
  MembershipRole.OWNER,
  MembershipRole.ADMIN,
  MembershipRole.MANAGER,
  MembershipRole.STAFF,
];

/**
 * Pure, side-effect-free predicate: is this actor restricted from seeing money?
 *
 *   restricted ⇔ holds an in-scope KITCHEN membership
 *                AND holds NO in-scope money-authorized membership
 *
 * Membership beats legacy role deliberately: a kitchen worker authenticates as
 * legacy RESTAURANT_STAFF (which sees money), but an in-scope KITCHEN membership
 * reduces them below that. This is the one access reduction P2.6.1 introduces —
 * hence it is only ever consulted under the KITCHEN_FIREWALL flag (see
 * evaluateFinancialFirewall). Scope is honored via membershipInScope
 * (BUSINESS↔businessId, ORGANIZATION↔organizationId; LOCATION unhonored), so a
 * KITCHEN membership for another business never restricts here.
 */
export function isFinanciallyRestricted(tenant: TenantContext): boolean {
  const inScope = tenant.memberships.filter((m) => membershipInScope(m, tenant));
  const holdsKitchen = inScope.some((m) => m.role === MembershipRole.KITCHEN);
  if (!holdsKitchen) return false;
  const holdsMoneyRole = inScope.some((m) => MONEY_AUTHORIZED_MEMBERSHIP_ROLES.includes(m.role));
  return !holdsMoneyRole;
}

/**
 * The action the firewall should take for a request, folding in the flag mode
 * and the predicate. The single decision point shared by the response-redaction
 * call sites and the endpoint-denial middleware:
 *   - "allow"   → do nothing (flag off, no tenant, or actor not restricted).
 *   - "observe" → actor IS restricted, but the flag is in observe mode: callers
 *                 log a "would-…" decision and DO NOT reduce access.
 *   - "enforce" → actor IS restricted and the flag is in enforce mode: callers
 *                 redact / deny.
 *
 * Doubly gated: `tenant` is undefined unless TENANT_CONTEXT_ENABLED populated it,
 * and the mode is "off" by default — so with either flag off this returns
 * "allow" and the firewall is completely inert.
 */
export function evaluateFinancialFirewall(
  tenant: TenantContext | undefined,
  mode: KitchenFirewallMode = getKitchenFirewallMode(),
): "allow" | "observe" | "enforce" {
  if (mode === "off") return "allow";
  if (!tenant || !isFinanciallyRestricted(tenant)) return "allow";
  return mode;
}
