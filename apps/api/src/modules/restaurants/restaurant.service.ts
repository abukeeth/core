import { MembershipRole, MembershipScope, Prisma, type Restaurant } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { bestEffort } from "../../lib/best-effort";
import { ensureDefaultBusinessHours } from "../commerce/delivery-rules/hours.service";
import { ensureOnboardingStatus, recordOnboardingActivity } from "../onboarding/onboarding.service";
import { NoRestaurantError, RestaurantAlreadyExistsError, RestaurantNotFoundError } from "./restaurant.errors";
import { generateReferralCode } from "./referral-code";
import type { CreateRestaurantInput, UpdateRestaurantInput } from "./restaurant.validation";

type PrismaOrTx = typeof prisma | Prisma.TransactionClient;

const MAX_REFERRAL_CODE_ATTEMPTS = 5;

/**
 * Every restaurant gets its own shareable referral code at creation
 * time. Collisions are astronomically unlikely at this scale (32-bit
 * keyspace) but retried rather than assumed impossible, mirroring this
 * codebase's other unique-token generators under real contention.
 */
async function createWithUniqueReferralCode(
  tx: PrismaOrTx,
  data: Omit<Prisma.RestaurantUncheckedCreateInput, "referralCode">,
): Promise<Restaurant> {
  for (let attempt = 1; attempt <= MAX_REFERRAL_CODE_ATTEMPTS; attempt++) {
    try {
      return await tx.restaurant.create({ data: { ...data, referralCode: generateReferralCode() } });
    } catch (err) {
      const isReferralCodeCollision =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        (err.meta?.target as string[] | undefined)?.includes("referralCode");
      if (!isReferralCodeCollision || attempt === MAX_REFERRAL_CODE_ATTEMPTS) {
        throw err;
      }
    }
  }
  throw new Error("unreachable");
}

/**
 * Single source of truth for mapping an authenticated user to the
 * restaurant they're scoped to. Every restaurant/menu controller resolves
 * tenant scope through this function rather than trusting client input.
 */
export async function getOwnRestaurantId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { restaurantId: true } });
  return user?.restaurantId ?? null;
}

export async function createRestaurant(ownerId: string, input: CreateRestaurantInput): Promise<Restaurant> {
  const existingRestaurantId = await getOwnRestaurantId(ownerId);
  if (existingRestaurantId) {
    throw new RestaurantAlreadyExistsError();
  }

  // referralCode here is the *referrer's* code (from a ?ref= link), not
  // this restaurant's own — an unknown/invalid code is silently ignored
  // rather than blocking signup, the same "don't let a bad referral
  // break the primary action" convention used for coupons elsewhere.
  const { referralCode: referrerCode, name, ...rest } = input;
  const referrer = referrerCode
    ? await prisma.restaurant.findUnique({ where: { referralCode: referrerCode }, select: { id: true } })
    : null;

  // Sprint 18 Business Setup Wizard step 1 only collects businessType — the
  // owner names their business in step 2 (Business Info). Resolved once here so
  // the Organization and the Restaurant share the same name.
  const businessName = name ?? "My Business";

  const restaurant = await prisma.$transaction(async (tx) => {
    // BOS Phase 1 (P1.2a) — create the Organization that owns this Business,
    // atomically with the Restaurant and the owner link. Uses tx.organization
    // (NOT the global createOrganization helper) so it participates in this
    // transaction and rolls back together on any failure — no orphan
    // Organization and no orphan Restaurant. ownerUserId mirrors the owner
    // pointer; this is not a membership/role (that is P2).
    const organization = await tx.organization.create({
      data: { name: businessName, ownerUserId: ownerId },
    });
    const created = await createWithUniqueReferralCode(tx, {
      ownerId,
      name: businessName,
      ...rest,
      // Choosing a business type (or the wizard creating this row at all)
      // completes step 1; the owner resumes at step 2 next.
      setupStep: "BUSINESS_INFO",
      referredById: referrer?.id,
      // Link the Business to its Organization at creation time (P1.2a). The
      // column remains nullable; backfill of pre-existing rows is P1.2b.
      organizationId: organization.id,
    });
    await tx.user.update({ where: { id: ownerId }, data: { restaurantId: created.id } });

    // BOS Phase 2 (P2.3) — grant the owner their scoped OWNER memberships,
    // atomically with the Organization/Restaurant above. Uses tx.membership
    // (NOT the global createMembership helper) so it participates in this
    // transaction and rolls back together on any failure — no partial grants.
    // Mirrors what the P2.2 backfill created for pre-existing owners; nothing
    // reads memberships yet (dual-read is P2.5), so this changes no observable
    // behavior. A fresh owner (guarded above by RestaurantAlreadyExistsError)
    // has no prior memberships, so no idempotency guard is needed here.
    await tx.membership.create({
      data: { userId: ownerId, role: MembershipRole.OWNER, scopeType: MembershipScope.ORGANIZATION, scopeId: organization.id },
    });
    await tx.membership.create({
      data: { userId: ownerId, role: MembershipRole.OWNER, scopeType: MembershipScope.BUSINESS, scopeId: created.id },
    });

    return created;
  });
  // Open the onboarding lifecycle record so progress is tracked from step 1.
  await bestEffort(() => ensureOnboardingStatus(restaurant.id));
  // Onboarding V3 — new stores are open 24/7 by default so they accept orders
  // immediately (owner adjusts hours in Settings). Best-effort: a seeding
  // failure must never block business creation.
  await bestEffort(() => ensureDefaultBusinessHours(restaurant.id));
  return restaurant;
}

/**
 * Advances (or rewinds) which wizard step the owner should resume at —
 * the single source of truth for "where was I" across logins/devices.
 *
 * Reaching DONE also publishes the restaurant. Nothing else in the
 * onboarding wizard ever sets `isPublished` (the AI Website Builder path
 * in website-theme-step.tsx only creates/generates a Site, and the "Skip
 * for now" path calls straight through to here) — without this, every
 * newly onboarded restaurant stayed unpublished, and the QR code /
 * "Customer website" link the Launch Center shows immediately after
 * onboarding (apps/web/src/app/dashboard/launch/launch-center.tsx,
 * pointing at /order/:restaurantId) 404'd with "Restaurant not found"
 * (getPublicMenu, public-menu.service.ts, which treats an unpublished
 * restaurant identically to a nonexistent one by design). This call site
 * is reached exactly once per restaurant in normal use — website-theme-
 * step.tsx's advance() is the only place setupStep transitions to DONE —
 * so this doesn't risk re-publishing a restaurant an owner deliberately
 * unpublished later via Restaurant Settings.
 */
export async function setSetupStep(userId: string, setupStep: Restaurant["setupStep"]): Promise<Restaurant> {
  const restaurant = await getOwnRestaurant(userId);
  const updated = await prisma.restaurant.update({
    where: { id: restaurant.id },
    data: { setupStep, ...(setupStep === "DONE" ? { isPublished: true } : {}) },
  });
  // Advance the onboarding lifecycle record (last-active / completion) so
  // progress survives refresh and "leave and return", without any UI change.
  await bestEffort(() => recordOnboardingActivity(updated.id, setupStep));
  return updated;
}

export async function listReferrals(restaurantId: string): Promise<Pick<Restaurant, "id" | "name" | "isPublished" | "createdAt">[]> {
  return prisma.restaurant.findMany({
    where: { referredById: restaurantId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, isPublished: true, createdAt: true },
  });
}

export async function getOwnRestaurant(userId: string): Promise<Restaurant> {
  const restaurantId = await getOwnRestaurantId(userId);
  if (!restaurantId) {
    throw new NoRestaurantError();
  }
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant) {
    throw new NoRestaurantError();
  }
  return restaurant;
}

/**
 * BOS Phase 0 (P0.3) — fetch the caller's business/restaurant by an
 * already-resolved business id (i.e. `req.tenant.businessId`). This is the
 * second half of `getOwnRestaurant` split out so the id-resolution step can be
 * supplied by the Tenant Context instead of re-derived per user. Behavior is
 * identical to `getOwnRestaurant`'s fetch: a null/absent id or a missing record
 * both raise `NoRestaurantError` (→ 404), exactly as today. `getOwnRestaurant`
 * remains the legacy fallback and is intentionally left unchanged.
 */
export async function getRestaurantByBusinessId(businessId: string | null): Promise<Restaurant> {
  if (!businessId) {
    throw new NoRestaurantError();
  }
  const restaurant = await prisma.restaurant.findUnique({ where: { id: businessId } });
  if (!restaurant) {
    throw new NoRestaurantError();
  }
  return restaurant;
}

export async function updateRestaurantById(restaurantId: string, input: UpdateRestaurantInput): Promise<Restaurant> {
  return prisma.restaurant.update({ where: { id: restaurantId }, data: input });
}

export async function updateOwnRestaurant(userId: string, input: UpdateRestaurantInput): Promise<Restaurant> {
  const restaurant = await getOwnRestaurant(userId);
  return updateRestaurantById(restaurant.id, input);
}

export async function listAllRestaurants(): Promise<Restaurant[]> {
  return prisma.restaurant.findMany({ orderBy: { createdAt: "desc" } });
}

async function setSuspended(restaurantId: string, isSuspended: boolean, reason?: string): Promise<Restaurant> {
  const existing = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!existing) {
    throw new RestaurantNotFoundError();
  }
  return prisma.restaurant.update({
    where: { id: restaurantId },
    data: { isSuspended, suspendedReason: isSuspended ? (reason ?? null) : null },
  });
}

export function suspendRestaurant(restaurantId: string, reason?: string): Promise<Restaurant> {
  return setSuspended(restaurantId, true, reason);
}

export function unsuspendRestaurant(restaurantId: string): Promise<Restaurant> {
  return setSuspended(restaurantId, false);
}
