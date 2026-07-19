import type { Organization } from "@prisma/client";
import { prisma } from "../../lib/prisma";

/**
 * BOS Phase 1 (P1) — Organization layer.
 *
 * Minimal create/read helpers for the Organization entity — the commercial/
 * account root that sits above the Business (= Restaurant). In P1 an
 * Organization wraps exactly one Business (1:1:1 with its owner) and records
 * `ownerUserId` (a plain pointer, not a membership/role).
 *
 * PR-P1.1 scope: these helpers exist and are unit-tested but are **not wired**
 * anywhere yet — no backfill (PR-P1.2), no creation-path integration
 * (PR-P1.2), no Tenant Context population (PR-P1.3). Adding them now keeps the
 * schema entity and its access surface reviewable in isolation.
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
