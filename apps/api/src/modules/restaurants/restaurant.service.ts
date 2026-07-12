import { Prisma, type Restaurant } from "@prisma/client";
import { prisma } from "../../lib/prisma";
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

  return prisma.$transaction(async (tx) => {
    const restaurant = await createWithUniqueReferralCode(tx, {
      ownerId,
      // Sprint 18 Business Setup Wizard step 1 only collects businessType —
      // the owner names their business in step 2 (Business Info).
      name: name ?? "My Business",
      ...rest,
      // Choosing a business type (or the wizard creating this row at all)
      // completes step 1; the owner resumes at step 2 next.
      setupStep: "BUSINESS_INFO",
      referredById: referrer?.id,
    });
    await tx.user.update({ where: { id: ownerId }, data: { restaurantId: restaurant.id } });
    return restaurant;
  });
}

/**
 * Advances (or rewinds) which wizard step the owner should resume at —
 * the single source of truth for "where was I" across logins/devices.
 */
export async function setSetupStep(userId: string, setupStep: Restaurant["setupStep"]): Promise<Restaurant> {
  const restaurant = await getOwnRestaurant(userId);
  return prisma.restaurant.update({ where: { id: restaurant.id }, data: { setupStep } });
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
