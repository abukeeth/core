import type { DeliveryRule, DeliveryZone } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { DeliveryRuleNotFoundError, DeliveryZoneNotFoundError, InvalidFallbackRuleError } from "./delivery-zones.errors";
import type {
  CreateDeliveryRuleInput,
  CreateDeliveryZoneInput,
  UpdateDeliveryRuleInput,
  UpdateDeliveryZoneInput,
} from "./delivery-zones.validation";

// --- DeliveryZone -------------------------------------------------------------

export async function listZones(restaurantId: string): Promise<DeliveryZone[]> {
  return prisma.deliveryZone.findMany({ where: { restaurantId } });
}

export async function createZone(restaurantId: string, input: CreateDeliveryZoneInput): Promise<DeliveryZone> {
  return prisma.deliveryZone.create({ data: { restaurantId, name: input.name, geometry: input.geometry, isActive: input.isActive } });
}

async function findOwnZone(restaurantId: string, id: string): Promise<DeliveryZone> {
  const zone = await prisma.deliveryZone.findUnique({ where: { id } });
  if (!zone || zone.restaurantId !== restaurantId) {
    throw new DeliveryZoneNotFoundError();
  }
  return zone;
}

export async function updateZone(
  restaurantId: string,
  id: string,
  input: UpdateDeliveryZoneInput,
): Promise<DeliveryZone> {
  const zone = await findOwnZone(restaurantId, id);
  return prisma.deliveryZone.update({ where: { id: zone.id }, data: input });
}

export async function deleteZone(restaurantId: string, id: string): Promise<void> {
  const zone = await findOwnZone(restaurantId, id);
  await prisma.deliveryZone.delete({ where: { id: zone.id } });
}

// --- DeliveryRule ---------------------------------------------------------------

export async function listRules(restaurantId: string): Promise<DeliveryRule[]> {
  return prisma.deliveryRule.findMany({ where: { restaurantId }, orderBy: { priority: "asc" } });
}

/** Mirrors smart-routing.ts's MAX_FALLBACK_DEPTH — bounds the cycle-detection walk below (Sprint 07.7 H-9). */
const MAX_FALLBACK_CHAIN_DEPTH = 5;

/**
 * Rejects a fallback pointing at another restaurant's rule, at itself
 * (self-reference), or at a chain that loops back to `ruleId` within a
 * bounded number of hops (a would-be cycle) — `ruleId` is the rule being
 * updated, undefined when creating a new rule (which can't yet be part of
 * any existing chain) (Sprint 07.7 H-9).
 */
async function validateFallback(restaurantId: string, fallbackToRuleId: string | undefined, ruleId?: string): Promise<void> {
  if (!fallbackToRuleId) return;
  if (fallbackToRuleId === ruleId) {
    throw new InvalidFallbackRuleError();
  }
  const fallback = await prisma.deliveryRule.findUnique({ where: { id: fallbackToRuleId } });
  if (!fallback || fallback.restaurantId !== restaurantId) {
    throw new InvalidFallbackRuleError();
  }

  if (ruleId) {
    let current: DeliveryRule | null = fallback;
    for (let depth = 0; current?.fallbackToRuleId && depth < MAX_FALLBACK_CHAIN_DEPTH; depth++) {
      if (current.fallbackToRuleId === ruleId) {
        throw new InvalidFallbackRuleError();
      }
      current = await prisma.deliveryRule.findUnique({ where: { id: current.fallbackToRuleId } });
    }
  }
}

export async function createRule(restaurantId: string, input: CreateDeliveryRuleInput): Promise<DeliveryRule> {
  await validateFallback(restaurantId, input.fallbackToRuleId);
  return prisma.deliveryRule.create({ data: { restaurantId, ...input } });
}

async function findOwnRule(restaurantId: string, id: string): Promise<DeliveryRule> {
  const rule = await prisma.deliveryRule.findUnique({ where: { id } });
  if (!rule || rule.restaurantId !== restaurantId) {
    throw new DeliveryRuleNotFoundError();
  }
  return rule;
}

export async function updateRule(
  restaurantId: string,
  id: string,
  input: UpdateDeliveryRuleInput,
): Promise<DeliveryRule> {
  const rule = await findOwnRule(restaurantId, id);
  await validateFallback(restaurantId, input.fallbackToRuleId, rule.id);
  return prisma.deliveryRule.update({ where: { id: rule.id }, data: input });
}

export async function deleteRule(restaurantId: string, id: string): Promise<void> {
  const rule = await findOwnRule(restaurantId, id);
  await prisma.deliveryRule.delete({ where: { id: rule.id } });
}
