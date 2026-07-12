import type { LoyaltyAccount, LoyaltyProgram, Order, Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import type { UpdateLoyaltyProgramInput } from "./loyalty.validation";

type PrismaOrTx = typeof prisma | Prisma.TransactionClient;

export async function getProgram(restaurantId: string): Promise<LoyaltyProgram | null> {
  return prisma.loyaltyProgram.findUnique({ where: { restaurantId } });
}

export async function getOrCreateProgram(restaurantId: string): Promise<LoyaltyProgram> {
  return prisma.loyaltyProgram.upsert({
    where: { restaurantId },
    create: { restaurantId },
    update: {},
  });
}

export async function updateProgram(restaurantId: string, input: UpdateLoyaltyProgramInput): Promise<LoyaltyProgram> {
  return prisma.loyaltyProgram.upsert({
    where: { restaurantId },
    create: { restaurantId, ...input },
    update: input,
  });
}

async function getAccount(customerId: string, restaurantId: string): Promise<LoyaltyAccount | null> {
  return prisma.loyaltyAccount.findUnique({ where: { customerId_restaurantId: { customerId, restaurantId } } });
}

async function getOrCreateAccount(customerId: string, restaurantId: string): Promise<LoyaltyAccount> {
  return prisma.loyaltyAccount.upsert({
    where: { customerId_restaurantId: { customerId, restaurantId } },
    create: { customerId, restaurantId },
    update: {},
  });
}

export interface LoyaltyAccountSummary {
  program: LoyaltyProgram | null;
  pointsBalance: number;
}

export async function getAccountSummary(customerId: string, restaurantId: string): Promise<LoyaltyAccountSummary> {
  const [program, account] = await Promise.all([getProgram(restaurantId), getAccount(customerId, restaurantId)]);
  return { program, pointsBalance: account?.pointsBalance ?? 0 };
}

/**
 * Points awarded per whole dollar ($1 = 100 cents) of order SUBTOTAL —
 * intentionally excludes tax/tip/fees, matching common loyalty-program
 * convention. `pointsPerDollarCents` keeps its schema name for continuity
 * with `redemptionRateCentsPerPoint` below, but is a plain point count,
 * not itself a cents value.
 */
export function computePointsEarned(program: Pick<LoyaltyProgram, "isActive" | "pointsPerDollarCents">, subtotalCents: number): number {
  if (!program.isActive || program.pointsPerDollarCents <= 0 || subtotalCents <= 0) return 0;
  return Math.floor(subtotalCents / 100) * program.pointsPerDollarCents;
}

/** Discount cents for redeeming `points`, capped by the caller against the order's remaining subtotal. */
export function computeRedemptionDiscountCents(
  program: Pick<LoyaltyProgram, "isActive" | "redemptionRateCentsPerPoint"> | null,
  points: number,
): number {
  if (!program || !program.isActive || program.redemptionRateCentsPerPoint <= 0 || points <= 0) return 0;
  return points * program.redemptionRateCentsPerPoint;
}

/**
 * Idempotent: a repeat call for the same order (e.g. a retried
 * best-effort call) is a no-op once an EARN transaction for that orderId
 * already exists. Guests never accrue points in this v1 — there's no
 * LoyaltyAccount identity to credit without a Customer row.
 */
export async function earnPointsForCompletedOrder(order: Order): Promise<void> {
  if (!order.customerId) return;

  const program = await getProgram(order.restaurantId);
  if (!program) return;

  const points = computePointsEarned(program, order.subtotalCents);
  if (points <= 0) return;

  const existing = await prisma.loyaltyTransaction.findFirst({ where: { orderId: order.id, type: "EARN" } });
  if (existing) return;

  const account = await getOrCreateAccount(order.customerId, order.restaurantId);
  await prisma.$transaction([
    prisma.loyaltyAccount.update({ where: { id: account.id }, data: { pointsBalance: { increment: points } } }),
    prisma.loyaltyTransaction.create({
      data: { loyaltyAccountId: account.id, orderId: order.id, points, type: "EARN" },
    }),
  ]);
}

/**
 * Atomically debits `points` from the customer's balance for this
 * restaurant and records a REDEEM transaction — designed to run INSIDE
 * an already-open transaction (`tx`), immediately before/alongside order
 * creation, mirroring the compare-and-swap pattern already used for
 * refund reservations and cash-payment idempotency elsewhere in this
 * codebase: the WHERE-guarded UPDATE is atomic at the database's row
 * level regardless of isolation level, so two concurrent redemptions
 * racing the same balance can never both succeed.
 *
 * Returns false (caller must abort/reject) if the balance no longer
 * covers `points` — e.g. a concurrent redemption elsewhere won the race,
 * or the balance changed between quote time and placement time.
 */
export async function redeemPointsInTransaction(
  tx: PrismaOrTx,
  customerId: string,
  restaurantId: string,
  points: number,
  orderId: string,
): Promise<boolean> {
  const account = await tx.loyaltyAccount.findUnique({ where: { customerId_restaurantId: { customerId, restaurantId } } });
  if (!account) return false;

  const { count } = await tx.loyaltyAccount.updateMany({
    where: { id: account.id, pointsBalance: { gte: points } },
    data: { pointsBalance: { decrement: points } },
  });
  if (count === 0) return false;

  await tx.loyaltyTransaction.create({
    data: { loyaltyAccountId: account.id, orderId, points: -points, type: "REDEEM" },
  });
  return true;
}
