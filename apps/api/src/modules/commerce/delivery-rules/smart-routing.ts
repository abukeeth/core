import type { DeliveryConfig, DeliveryRule, DeliveryZone, FulfillmentMethod, FulfillmentType } from "@prisma/client";
import { isPointInZone } from "./geometry";

const DEFAULT_MAX_CONCURRENT_DRIVER_DELIVERIES = 5;

export interface RoutingInput {
  restaurantId: string;
  isOpen: boolean;
  kitchenAvailable: boolean;
  activeDriverCount: number;
  maxConcurrentDriverDeliveries?: number;
  deliveryConfig: DeliveryConfig;
  deliveryZones: DeliveryZone[];
  deliveryRules: DeliveryRule[];
  distanceMiles?: number;
  /** The delivery address's own coordinates — required for any rule with a zoneId to be evaluated; undefined for an ungeocoded address (fails closed for zone-scoped rules only, per C-12). */
  deliveryLat?: number;
  deliveryLng?: number;
  subtotalCents: number;
  fulfillmentType: FulfillmentType;
  enabledPaymentMethodTypes: string[];
}

export interface RoutingResult {
  eligible: boolean;
  reason?: string;
  resolvedFulfillmentMethod?: FulfillmentMethod;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Safety net bounding how many fallback hops resolveFallback will follow — zones.service.ts's validateFallback rejects cycles at creation time, so this should never actually be exhausted in practice (Sprint 07.7 H-9). */
const MAX_FALLBACK_DEPTH = 5;

/**
 * Follows a rule's fallbackToRuleId chain, re-applying the same busy-driver
 * check to each candidate — a fallback that is itself RESTAURANT_DRIVER and
 * also over the concurrency limit must not be selected, it must keep
 * falling back (Sprint 07.7 H-9). Bounded to MAX_FALLBACK_DEPTH hops as
 * defense in depth against any pre-existing bad data.
 */
function resolveFallback(
  rule: DeliveryRule,
  byId: Map<string, DeliveryRule>,
  activeDriverCount: number,
  maxConcurrent: number,
  depth = 0,
): DeliveryRule | undefined {
  if (depth >= MAX_FALLBACK_DEPTH) return undefined;
  const fallback = rule.fallbackToRuleId ? byId.get(rule.fallbackToRuleId) : undefined;
  if (!fallback?.isActive) return undefined;
  if (fallback.fulfillmentMethod === "RESTAURANT_DRIVER" && activeDriverCount >= maxConcurrent) {
    return resolveFallback(fallback, byId, activeDriverCount, maxConcurrent, depth + 1);
  }
  return fallback;
}

/**
 * The Smart Routing Engine (Sprint 07 spec §8) — a deterministic, rule-
 * based decision function, deliberately not AI-driven (money/logistics
 * decisions must be exact and auditable). Every input is supplied by the
 * caller; this function makes zero DB calls itself.
 */
export function evaluateRouting(input: RoutingInput): RoutingResult {
  // 1. Restaurant closed — cheapest, most fundamental check.
  if (!input.isOpen) {
    return { eligible: false, reason: "Restaurant is closed" };
  }

  // 2. Kitchen not available (manually paused or at concurrent-order capacity).
  if (!input.kitchenAvailable) {
    return { eligible: false, reason: "Kitchen is temporarily paused" };
  }

  if (input.fulfillmentType === "PICKUP") {
    if (!input.deliveryConfig.isPickupEnabled) {
      return { eligible: false, reason: "Pickup is not available at this restaurant" };
    }
    if (input.subtotalCents < input.deliveryConfig.minOrderCentsForPickup) {
      return {
        eligible: false,
        reason: `Minimum order for pickup is ${formatCents(input.deliveryConfig.minOrderCentsForPickup)}`,
      };
    }
    return { eligible: true, resolvedFulfillmentMethod: "PICKUP" };
  }

  if (input.fulfillmentType === "DINE_IN") {
    if (!input.deliveryConfig.isDineInEnabled) {
      return { eligible: false, reason: "Dine-in ordering is not available at this restaurant" };
    }
    return { eligible: true };
  }

  // DELIVERY from here on.
  if (!input.deliveryConfig.isDeliveryEnabled) {
    return { eligible: false, reason: "Delivery is not available at this restaurant" };
  }

  const distanceMiles = input.distanceMiles ?? 0;

  // 3. Maximum delivery distance — cheapest early-exit ceiling check.
  if (input.deliveryConfig.maxDeliveryDistanceMiles !== null && distanceMiles > input.deliveryConfig.maxDeliveryDistanceMiles) {
    return { eligible: false, reason: "Delivery address is outside our delivery area" };
  }

  // 4. Minimum order amount for delivery.
  if (input.subtotalCents < input.deliveryConfig.minOrderCentsForDelivery) {
    return {
      eligible: false,
      reason: `Minimum order for delivery is ${formatCents(input.deliveryConfig.minOrderCentsForDelivery)}`,
    };
  }

  // 5. Resolve eligibility + fulfillment method: advanced mode (zones/rules)
  // supersedes simple mode (radius) whenever rules exist.
  const maxConcurrent = input.maxConcurrentDriverDeliveries ?? DEFAULT_MAX_CONCURRENT_DRIVER_DELIVERIES;

  if (input.deliveryRules.length > 0) {
    const resolved = resolveRuleChain(
      input.deliveryRules,
      input.deliveryZones,
      distanceMiles,
      input.activeDriverCount,
      maxConcurrent,
      input.deliveryLat,
      input.deliveryLng,
    );
    if (!resolved) {
      return { eligible: false, reason: "Delivery address is outside our delivery area" };
    }
    // Fee computation is a separate concern (fee-rules.service.ts's
    // resolveDeliveryFeeCents) deliberately kept out of this eligibility
    // decision — the caller (checkout) computes the fee once routing has
    // resolved a method, using its own already-fetched DeliveryFeeRule[].
    return { eligible: true, resolvedFulfillmentMethod: resolved.fulfillmentMethod };
  }

  if (input.deliveryConfig.deliveryRadiusMiles !== null) {
    if (distanceMiles > input.deliveryConfig.deliveryRadiusMiles) {
      return { eligible: false, reason: "Delivery address is outside our delivery area" };
    }
    return { eligible: true, resolvedFulfillmentMethod: "RESTAURANT_DRIVER" };
  }

  // Delivery is enabled but neither zones/rules nor a radius are configured.
  return { eligible: false, reason: "Delivery area has not been configured for this restaurant yet" };
}

/**
 * Walks active rules in priority order, finding the first whose distance
 * band contains `distanceMiles` AND — for a rule scoped to a zone via
 * `zoneId` — whose zone's polygon/radius geometry actually contains the
 * delivery point. A zone-scoped rule with no delivery point available
 * (ungeocoded address) never matches — fails closed rather than silently
 * ignoring the zone requirement (Sprint 07.6 C-12). If a matching rule
 * needs a restaurant driver and the driver concurrency limit is reached,
 * it's treated as unavailable and the chain continues to its
 * `fallbackToRuleId` (if set) or the next rule by priority.
 */
function resolveRuleChain(
  rules: DeliveryRule[],
  zones: DeliveryZone[],
  distanceMiles: number,
  activeDriverCount: number,
  maxConcurrent: number,
  deliveryLat?: number,
  deliveryLng?: number,
): DeliveryRule | undefined {
  const byId = new Map(rules.map((r) => [r.id, r]));
  const zonesById = new Map(zones.map((z) => [z.id, z]));
  const sorted = [...rules].filter((r) => r.isActive).sort((a, b) => a.priority - b.priority);

  for (const rule of sorted) {
    const min = rule.minDistanceMiles ?? 0;
    const max = rule.maxDistanceMiles ?? Infinity;
    if (distanceMiles < min || distanceMiles > max) continue;

    if (rule.zoneId) {
      const zone = zonesById.get(rule.zoneId);
      if (!zone || deliveryLat === undefined || deliveryLng === undefined || !isPointInZone(zone, deliveryLat, deliveryLng)) {
        continue;
      }
    }

    if (rule.fulfillmentMethod === "RESTAURANT_DRIVER" && activeDriverCount >= maxConcurrent) {
      // Busy — try this rule's explicit fallback (and, if that's also busy,
      // its own fallback, and so on), else keep scanning the
      // priority-ordered list for another matching band.
      const fallback = resolveFallback(rule, byId, activeDriverCount, maxConcurrent);
      if (fallback) {
        return fallback;
      }
      continue;
    }

    return rule;
  }

  return undefined;
}
