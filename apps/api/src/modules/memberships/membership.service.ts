import type { Membership, MembershipRole, MembershipScope } from "@prisma/client";
import { prisma } from "../../lib/prisma";

/**
 * BOS Phase 2 (P2.1) — Membership layer.
 *
 * Minimal create/read helpers for the Membership entity — a scoped role grant
 * (User × MembershipRole × Scope). In P2.1 these helpers exist and are
 * unit-tested but are **not wired** anywhere yet — no backfill (P2.2), no
 * creation-path integration (P2.3), no Tenant Context population (P2.4), no
 * authorization change (P2.5/P2.6). Adding them now keeps the entity and its
 * access surface reviewable in isolation.
 *
 * `scopeId` is a soft/polymorphic reference (no DB FK): it targets an
 * Organization, a Business (Restaurant), or a Location depending on `scopeType`.
 * Referential integrity for scope targets is enforced by the caller/backfill,
 * not the database; FK hardening is deferred to P4/P5 (see P2_1_EXECUTION_SPEC.md).
 */

export interface CreateMembershipInput {
  userId: string;
  role: MembershipRole;
  scopeType: MembershipScope;
  scopeId: string;
}

/** Creates a scoped role grant for a user. */
export async function createMembership(input: CreateMembershipInput): Promise<Membership> {
  return prisma.membership.create({
    data: {
      userId: input.userId,
      role: input.role,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
    },
  });
}

/** Returns all memberships held by a user (the read path P2.4 will consume). */
export async function getMembershipsForUser(userId: string): Promise<Membership[]> {
  return prisma.membership.findMany({ where: { userId } });
}
