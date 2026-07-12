import type { DeliveryFeeRule, FulfillmentType, ServiceFeeRule } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { DeliveryFeeRuleNotFoundError, ServiceFeeRuleNotFoundError } from "./fee-rules.errors";
import type {
  CreateDeliveryFeeRuleInput,
  CreateServiceFeeRuleInput,
  UpdateDeliveryFeeRuleInput,
  UpdateServiceFeeRuleInput,
} from "./fee-rules.validation";

const BASIS_POINTS_DIVISOR = 10_000;

// --- CRUD: DeliveryFeeRule ---------------------------------------------------

export async function listDeliveryFeeRules(restaurantId: string): Promise<DeliveryFeeRule[]> {
  return prisma.deliveryFeeRule.findMany({ where: { restaurantId }, orderBy: { priority: "asc" } });
}

export async function createDeliveryFeeRule(
  restaurantId: string,
  input: CreateDeliveryFeeRuleInput,
): Promise<DeliveryFeeRule> {
  return prisma.deliveryFeeRule.create({ data: { restaurantId, ...input } });
}

async function findOwnDeliveryFeeRule(restaurantId: string, id: string): Promise<DeliveryFeeRule> {
  const rule = await prisma.deliveryFeeRule.findUnique({ where: { id } });
  if (!rule || rule.restaurantId !== restaurantId) {
    throw new DeliveryFeeRuleNotFoundError();
  }
  return rule;
}

export async function updateDeliveryFeeRule(
  restaurantId: string,
  id: string,
  input: UpdateDeliveryFeeRuleInput,
): Promise<DeliveryFeeRule> {
  const rule = await findOwnDeliveryFeeRule(restaurantId, id);
  return prisma.deliveryFeeRule.update({ where: { id: rule.id }, data: input });
}

export async function deleteDeliveryFeeRule(restaurantId: string, id: string): Promise<void> {
  const rule = await findOwnDeliveryFeeRule(restaurantId, id);
  await prisma.deliveryFeeRule.delete({ where: { id: rule.id } });
}

// --- CRUD: ServiceFeeRule -----------------------------------------------------

export async function listServiceFeeRules(restaurantId: string): Promise<ServiceFeeRule[]> {
  return prisma.serviceFeeRule.findMany({ where: { restaurantId } });
}

export async function createServiceFeeRule(
  restaurantId: string,
  input: CreateServiceFeeRuleInput,
): Promise<ServiceFeeRule> {
  return prisma.serviceFeeRule.create({ data: { restaurantId, ...input } });
}

async function findOwnServiceFeeRule(restaurantId: string, id: string): Promise<ServiceFeeRule> {
  const rule = await prisma.serviceFeeRule.findUnique({ where: { id } });
  if (!rule || rule.restaurantId !== restaurantId) {
    throw new ServiceFeeRuleNotFoundError();
  }
  return rule;
}

export async function updateServiceFeeRule(
  restaurantId: string,
  id: string,
  input: UpdateServiceFeeRuleInput,
): Promise<ServiceFeeRule> {
  const rule = await findOwnServiceFeeRule(restaurantId, id);
  return prisma.serviceFeeRule.update({ where: { id: rule.id }, data: input });
}

export async function deleteServiceFeeRule(restaurantId: string, id: string): Promise<void> {
  const rule = await findOwnServiceFeeRule(restaurantId, id);
  await prisma.serviceFeeRule.delete({ where: { id: rule.id } });
}

// --- Pure computation (no DB access) ------------------------------------------

/**
 * Finds the first active rule (priority ascending) whose distance band
 * contains `distanceMiles` (missing min treated as 0, missing max as
 * Infinity) and computes its fee. feeValue is dual-unit by feeType: cents
 * for FLAT/PER_MILE, basis points for PERCENTAGE_OF_SUBTOTAL. Returns 0 if
 * no rule matches — the checkout module treats "no delivery fee configured"
 * as free delivery, not an error.
 */
export function resolveDeliveryFeeCents(
  rules: DeliveryFeeRule[],
  distanceMiles: number,
  subtotalCents: number,
): number {
  const sorted = [...rules].filter((r) => r.isActive).sort((a, b) => a.priority - b.priority);
  const match = sorted.find((rule) => {
    const min = rule.minDistanceMiles ?? 0;
    const max = rule.maxDistanceMiles ?? Infinity;
    return distanceMiles >= min && distanceMiles <= max;
  });
  if (!match) return 0;

  switch (match.feeType) {
    case "FLAT":
      return match.feeValue;
    case "PER_MILE":
      return Math.round(match.feeValue * distanceMiles);
    case "PERCENTAGE_OF_SUBTOTAL":
      return Math.round((subtotalCents * match.feeValue) / BASIS_POINTS_DIVISOR);
  }
}

/**
 * Sums every active rule whose `appliesTo` matches ALL_ORDERS or the
 * specific fulfillmentType. Always itemized separately from tip — a
 * service fee funds restaurant operations, never a driver tip.
 */
export function resolveServiceFeeCents(
  rules: ServiceFeeRule[],
  fulfillmentType: FulfillmentType,
  subtotalCents: number,
): number {
  const appliesToByType: Record<FulfillmentType, string> = {
    PICKUP: "PICKUP_ONLY",
    DELIVERY: "DELIVERY_ONLY",
    DINE_IN: "DINE_IN_ONLY",
  };

  return rules
    .filter((rule) => rule.isActive && (rule.appliesTo === "ALL_ORDERS" || rule.appliesTo === appliesToByType[fulfillmentType]))
    .reduce((total, rule) => {
      const feeCents =
        rule.feeType === "FLAT" ? rule.feeValue : Math.round((subtotalCents * rule.feeValue) / BASIS_POINTS_DIVISOR);
      return total + feeCents;
    }, 0);
}
