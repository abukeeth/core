import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { createLogger } from "../../lib/logger";
import { evaluateSubscription } from "../billing/entitlements";
import { recordAuditLog } from "./audit-log.service";
import {
  AdminDeleteConfirmationMismatchError,
  AdminTargetNotFoundError,
  CannotModifySelfError,
} from "./admin.errors";

const logger = createLogger("admin");

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function clampLimit(limit: number | undefined): number {
  return Math.min(Math.max(limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
}

// ---------------------------------------------------------------------------
// Users

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  emailVerified: boolean;
  restaurantId: string | null;
  restaurantName: string | null;
  createdAt: string;
}

export async function listUsers(query?: string, limit?: number): Promise<AdminUserRow[]> {
  const where: Prisma.UserWhereInput = query
    ? {
        OR: [
          { email: { contains: query, mode: "insensitive" } },
          { name: { contains: query, mode: "insensitive" } },
          { id: query },
        ],
      }
    : {};
  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: clampLimit(limit),
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      emailVerified: true,
      restaurantId: true,
      createdAt: true,
    },
  });
  const restaurantIds = [...new Set(users.map((u) => u.restaurantId).filter((id): id is string => id !== null))];
  const restaurants = restaurantIds.length
    ? await prisma.restaurant.findMany({ where: { id: { in: restaurantIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(restaurants.map((r) => [r.id, r.name]));
  return users.map((u) => ({
    ...u,
    restaurantName: u.restaurantId ? (nameById.get(u.restaurantId) ?? null) : null,
    createdAt: u.createdAt.toISOString(),
  }));
}

/** Deactivate/reactivate a user account. Deactivation kills login (auth checks isActive); an admin can never deactivate themselves. */
export async function setUserActive(adminId: string, userId: string, isActive: boolean): Promise<AdminUserRow> {
  if (adminId === userId) throw new CannotModifySelfError();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AdminTargetNotFoundError("User");
  const updated = await prisma.user.update({ where: { id: userId }, data: { isActive } });
  await recordAuditLog(adminId, isActive ? "USER_REACTIVATED" : "USER_DEACTIVATED", "User", userId, { email: user.email });
  return {
    id: updated.id,
    email: updated.email,
    name: updated.name,
    role: updated.role,
    isActive: updated.isActive,
    emailVerified: updated.emailVerified,
    restaurantId: updated.restaurantId,
    restaurantName: null,
    createdAt: updated.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Restaurants

export interface AdminRestaurantRow {
  id: string;
  name: string;
  businessType: string;
  ownerEmail: string | null;
  isPublished: boolean;
  isSuspended: boolean;
  suspendedReason: string | null;
  subscriptionState: string;
  trialEndsAt: string | null;
  orderCount: number;
  menuItemCount: number;
  createdAt: string;
}

export async function listRestaurantsDetailed(query?: string, limit?: number): Promise<AdminRestaurantRow[]> {
  const where: Prisma.RestaurantWhereInput = query
    ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { id: query }] }
    : {};
  const restaurants = await prisma.restaurant.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: clampLimit(limit),
    include: {
      owner: { select: { email: true } },
      platformSubscription: true,
      _count: { select: { orders: true, items: true } },
    },
  });
  return restaurants.map((r) => ({
    id: r.id,
    name: r.name,
    businessType: r.businessType,
    ownerEmail: r.owner?.email ?? null,
    isPublished: r.isPublished,
    isSuspended: r.isSuspended,
    suspendedReason: r.suspendedReason,
    subscriptionState: r.platformSubscription ? evaluateSubscription(r.platformSubscription).state : "NONE",
    trialEndsAt: r.platformSubscription?.trialEndsAt.toISOString() ?? null,
    orderCount: r._count.orders,
    menuItemCount: r._count.items,
    createdAt: r.createdAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Orders & payments (cross-tenant, read-only)

export interface AdminOrderRow {
  id: string;
  restaurantName: string;
  status: string;
  paymentStatus: string;
  fulfillmentType: string;
  source: string;
  totalCents: number;
  createdAt: string;
}

export async function listOrdersDetailed(restaurantId?: string, limit?: number): Promise<AdminOrderRow[]> {
  const orders = await prisma.order.findMany({
    where: restaurantId ? { restaurantId } : {},
    orderBy: { createdAt: "desc" },
    take: clampLimit(limit),
    include: { restaurant: { select: { name: true } } },
  });
  return orders.map((o) => ({
    id: o.id,
    restaurantName: o.restaurant.name,
    status: o.status,
    paymentStatus: o.paymentStatus,
    fulfillmentType: o.fulfillmentType,
    source: o.source,
    totalCents: o.totalCents,
    createdAt: o.createdAt.toISOString(),
  }));
}

export interface AdminPaymentRow {
  id: string;
  orderId: string;
  restaurantName: string;
  providerType: string | null;
  status: string;
  authorizedAmountCents: number;
  capturedAmountCents: number;
  refundedAmountCents: number;
  createdAt: string;
}

export async function listPaymentsDetailed(limit?: number): Promise<AdminPaymentRow[]> {
  const payments = await prisma.payment.findMany({
    orderBy: { createdAt: "desc" },
    take: clampLimit(limit),
    include: {
      order: { select: { restaurant: { select: { name: true } } } },
      provider: { select: { providerType: true } },
    },
  });
  return payments.map((p) => ({
    id: p.id,
    orderId: p.orderId,
    restaurantName: p.order.restaurant.name,
    providerType: p.provider?.providerType ?? null,
    status: p.status,
    authorizedAmountCents: p.authorizedAmountCents,
    capturedAmountCents: p.capturedAmountCents,
    refundedAmountCents: p.refundedAmountCents,
    createdAt: p.createdAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Restaurant deletion

/**
 * Hard delete of a Business and every row scoped to it — built for junk and
 * test signups. The caller must echo the restaurant's exact name
 * (`confirmName`) as a two-man-rule against fat-fingered ids. Executed as
 * one transaction of raw deletes ordered deepest-child first, because the
 * schema's FK constraints are RESTRICT (deliberately — no accidental
 * cascades in normal operation).
 *
 * Owner and staff User accounts are kept (their restaurantId is nulled) —
 * deleting a login identity is a separate, rarer decision than deleting a
 * business, and keeping it lets the owner start a fresh business.
 */
export async function deleteRestaurantCascade(adminId: string, restaurantId: string, confirmName: string): Promise<void> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { id: true, name: true, organizationId: true, ownerId: true },
  });
  if (!restaurant) throw new AdminTargetNotFoundError("Restaurant");
  if (restaurant.name !== confirmName) throw new AdminDeleteConfirmationMismatchError();

  const rid = restaurantId;
  await prisma.$transaction(
    async (tx) => {
      // Depth 3+ — rows hanging off this restaurant's orders/payments/sites.
      await tx.$executeRaw`DELETE FROM "Refund" WHERE "paymentId" IN (SELECT id FROM "Payment" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "restaurantId" = ${rid}))`;
      await tx.$executeRaw`DELETE FROM "DriverLocationPing" WHERE "driverAssignmentId" IN (SELECT id FROM "DriverAssignment" WHERE "fulfillmentId" IN (SELECT id FROM "Fulfillment" WHERE "restaurantId" = ${rid}))`;
      await tx.$executeRaw`DELETE FROM "DriverAssignment" WHERE "fulfillmentId" IN (SELECT id FROM "Fulfillment" WHERE "restaurantId" = ${rid})`;
      await tx.$executeRaw`DELETE FROM "SiteScore" WHERE "siteVersionId" IN (SELECT id FROM "SiteVersion" WHERE "siteId" IN (SELECT id FROM "Site" WHERE "restaurantId" = ${rid}))`;

      // Depth 2 — children of orders, menu items, providers, site.
      await tx.$executeRaw`DELETE FROM "Payment" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "restaurantId" = ${rid})`;
      await tx.$executeRaw`DELETE FROM "PaymentAttempt" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "restaurantId" = ${rid})`;
      await tx.$executeRaw`DELETE FROM "Tip" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "restaurantId" = ${rid})`;
      await tx.$executeRaw`DELETE FROM "CouponRedemption" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "restaurantId" = ${rid}) OR "couponId" IN (SELECT id FROM "Coupon" WHERE "restaurantId" = ${rid})`;
      await tx.$executeRaw`DELETE FROM "GiftCardTransaction" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "restaurantId" = ${rid}) OR "giftCardId" IN (SELECT id FROM "GiftCard" WHERE "restaurantId" = ${rid})`;
      await tx.$executeRaw`DELETE FROM "LoyaltyTransaction" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "restaurantId" = ${rid}) OR "accountId" IN (SELECT id FROM "LoyaltyAccount" WHERE "restaurantId" = ${rid})`;
      await tx.$executeRaw`DELETE FROM "FraudSignal" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "restaurantId" = ${rid})`;
      await tx.$executeRaw`DELETE FROM "OrderItem" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "restaurantId" = ${rid})`;
      await tx.$executeRaw`DELETE FROM "OrderEvent" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "restaurantId" = ${rid})`;
      await tx.$executeRaw`DELETE FROM "OrderTimeline" WHERE "orderId" IN (SELECT id FROM "Order" WHERE "restaurantId" = ${rid})`;
      await tx.$executeRaw`DELETE FROM "CartItem" WHERE "cartId" IN (SELECT id FROM "Cart" WHERE "restaurantId" = ${rid}) OR "menuItemId" IN (SELECT id FROM "MenuItem" WHERE "restaurantId" = ${rid})`;
      await tx.$executeRaw`DELETE FROM "MenuItemVariant" WHERE "menuItemId" IN (SELECT id FROM "MenuItem" WHERE "restaurantId" = ${rid})`;
      await tx.$executeRaw`DELETE FROM "MenuItemModifierGroup" WHERE "menuItemId" IN (SELECT id FROM "MenuItem" WHERE "restaurantId" = ${rid})`;
      await tx.$executeRaw`DELETE FROM "MenuItemInventory" WHERE "menuItemId" IN (SELECT id FROM "MenuItem" WHERE "restaurantId" = ${rid})`;
      await tx.$executeRaw`DELETE FROM "ModifierOption" WHERE "modifierGroupId" IN (SELECT id FROM "ModifierGroup" WHERE "restaurantId" = ${rid})`;
      await tx.$executeRaw`DELETE FROM "POSSyncLog" WHERE "posProviderId" IN (SELECT id FROM "POSProvider" WHERE "restaurantId" = ${rid})`;
      await tx.$executeRaw`DELETE FROM "CustomerPaymentMethod" WHERE "providerId" IN (SELECT id FROM "PaymentProvider" WHERE "restaurantId" = ${rid})`;
      await tx.$executeRaw`DELETE FROM "SiteVersion" WHERE "siteId" IN (SELECT id FROM "Site" WHERE "restaurantId" = ${rid})`;
      await tx.$executeRaw`DELETE FROM "DomainEvent" WHERE "siteId" IN (SELECT id FROM "Site" WHERE "restaurantId" = ${rid})`;
      await tx.$executeRaw`DELETE FROM "Domain" WHERE "siteId" IN (SELECT id FROM "Site" WHERE "restaurantId" = ${rid})`;
      await tx.$executeRaw`DELETE FROM "SiteAsset" WHERE "siteId" IN (SELECT id FROM "Site" WHERE "restaurantId" = ${rid})`;
      await tx.$executeRaw`DELETE FROM "GenerationJob" WHERE "siteId" IN (SELECT id FROM "Site" WHERE "restaurantId" = ${rid})`;
      await tx.$executeRaw`DELETE FROM "ContactMessage" WHERE "siteId" IN (SELECT id FROM "Site" WHERE "restaurantId" = ${rid})`;
      await tx.$executeRaw`DELETE FROM "NewsletterSubscriber" WHERE "siteId" IN (SELECT id FROM "Site" WHERE "restaurantId" = ${rid})`;

      // Depth 1 — everything carrying restaurantId directly.
      await tx.$executeRaw`DELETE FROM "Review" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "Transaction" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "Fulfillment" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "FulfillmentProvider" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "NotificationLog" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "OutboxEvent" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "Order" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "Cart" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "CustomerFavorite" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "MenuItem" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "MenuCategory" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "ImportJob" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "Site" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "RestaurantHours" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "PaymentMethod" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "PaymentProvider" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "Tax" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "Coupon" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "GiftCard" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "DeliveryConfig" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "DeliveryFeeRule" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "ServiceFeeRule" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "KitchenCapacity" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "DeliveryZone" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "DeliveryRule" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "ModifierGroup" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "Table" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "POSProvider" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "LoyaltyAccount" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "LoyaltyProgram" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "IdempotencyKey" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "OnboardingStatus" WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "PlatformSubscription" WHERE "restaurantId" = ${rid}`;

      // Detach people & memberships, then the Business itself and its Organization.
      await tx.$executeRaw`UPDATE "User" SET "restaurantId" = NULL WHERE "restaurantId" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "Membership" WHERE ("scopeType" = 'BUSINESS' AND "scopeId" = ${rid})`;
      await tx.$executeRaw`UPDATE "Restaurant" SET "referredById" = NULL WHERE "referredById" = ${rid}`;
      await tx.$executeRaw`DELETE FROM "Restaurant" WHERE "id" = ${rid}`;
      if (restaurant.organizationId) {
        await tx.$executeRaw`DELETE FROM "Membership" WHERE ("scopeType" = 'ORGANIZATION' AND "scopeId" = ${restaurant.organizationId})`;
        await tx.$executeRaw`DELETE FROM "Organization" WHERE "id" = ${restaurant.organizationId}`;
      }
    },
    { timeout: 60_000 },
  );

  logger.warn({ restaurantId: rid, name: restaurant.name }, "admin: restaurant hard-deleted");
  await recordAuditLog(adminId, "RESTAURANT_DELETED", "Restaurant", rid, { name: restaurant.name });
}
