import type { Organization } from "@prisma/client";
import { prisma } from "../../lib/prisma";

/**
 * BOS Phase 1 (P1) — Organization layer.
 *
 * Create/read helpers for the Organization entity — the commercial/account
 * root that sits above the Business (= Restaurant). In P1 an Organization wraps
 * exactly one Business (1:1:1 with its owner) and records `ownerUserId` (a plain
 * pointer, not a membership/role). Creation is wired into `createRestaurant`
 * (PR-P1.2a) and existing rows were backfilled (PR-P1.2b);
 * `getOrganizationIdForBusiness` is consumed by the Tenant Context resolver
 * (PR-P1.3).
 */

export interface CreateOrganizationInput {
  name: string;
  ownerUserId: string;
}

/** Creates an Organization owned by `ownerUserId`. */
export async function createOrganization(input: CreateOrganizationInput): Promise<Organization> {
  return prisma.organization.create({
    data: { name: input.name, ownerUserId: input.ownerUserId },
  });
}

/** Fetches an Organization by id, or null if none exists. */
export async function getOrganizationById(id: string): Promise<Organization | null> {
  return prisma.organization.findUnique({ where: { id } });
}

/**
 * BOS Phase 1 (P1.3) — resolves the Organization id that owns a Business, for
 * Tenant Context population. Reads `Restaurant.organizationId` (nullable until
 * PR-P1.2a/b have populated that row). Returns null if the business does not
 * exist or has no Organization yet.
 */
export async function getOrganizationIdForBusiness(businessId: string): Promise<string | null> {
  const business = await prisma.restaurant.findUnique({
    where: { id: businessId },
    select: { organizationId: true },
  });
  return business?.organizationId ?? null;
}
