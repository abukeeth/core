import { prisma } from "../../../lib/prisma";

const NOT_REAL_ORDER_STATUSES = ["CANCELLED", "FAILED"] as const;

export interface RevenueSummary {
  totalRevenueCents: number;
  averageOrderValueCents: number;
  totalOrders: number;
  ordersByStatus: Record<string, number>;
}

/**
 * "Revenue" here means every order that actually proceeded past
 * payment — everything except CANCELLED (never charged, per this
 * codebase's no-auto-refund-on-cancel design) and FAILED (payment never
 * captured). This intentionally includes fully/partially refunded
 * orders, since the charge did happen; a future iteration could break
 * out a separate net-of-refunds figure.
 */
export async function getRevenueSummary(restaurantId: string, days: number): Promise<RevenueSummary> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [aggregate, statusGroups] = await Promise.all([
    prisma.order.aggregate({
      where: { restaurantId, status: { notIn: [...NOT_REAL_ORDER_STATUSES] }, createdAt: { gte: since } },
      _sum: { totalCents: true },
      _avg: { totalCents: true },
      _count: true,
    }),
    prisma.order.groupBy({
      by: ["status"],
      where: { restaurantId, createdAt: { gte: since } },
      _count: true,
    }),
  ]);

  return {
    totalRevenueCents: aggregate._sum.totalCents ?? 0,
    averageOrderValueCents: Math.round(aggregate._avg.totalCents ?? 0),
    totalOrders: aggregate._count,
    ordersByStatus: Object.fromEntries(statusGroups.map((g) => [g.status, g._count])),
  };
}

export interface RevenueByDay {
  day: Date;
  revenueCents: number;
  orderCount: number;
}

export async function getRevenueByDay(restaurantId: string, days: number): Promise<RevenueByDay[]> {
  return prisma.$queryRaw<RevenueByDay[]>`
    SELECT date_trunc('day', "createdAt")::date AS day,
           COALESCE(SUM("totalCents"), 0)::int AS "revenueCents",
           COUNT(*)::int AS "orderCount"
    FROM "Order"
    WHERE "restaurantId" = ${restaurantId}
      AND "status" NOT IN ('CANCELLED', 'FAILED')
      AND "createdAt" >= NOW() - make_interval(days => ${days})
    GROUP BY day
    ORDER BY day ASC
  `;
}

export interface TopItem {
  menuItemId: string;
  name: string;
  quantitySold: number;
  revenueCents: number;
}

export async function getTopItems(restaurantId: string, days: number, limit: number): Promise<TopItem[]> {
  return prisma.$queryRaw<TopItem[]>`
    SELECT oi."menuItemId" AS "menuItemId",
           oi."nameSnapshot" AS name,
           SUM(oi."quantity")::int AS "quantitySold",
           SUM(oi."lineTotalCents")::int AS "revenueCents"
    FROM "OrderItem" oi
    JOIN "Order" o ON o.id = oi."orderId"
    WHERE o."restaurantId" = ${restaurantId}
      AND o."status" NOT IN ('CANCELLED', 'FAILED')
      AND o."createdAt" >= NOW() - make_interval(days => ${days})
    GROUP BY oi."menuItemId", oi."nameSnapshot"
    ORDER BY "quantitySold" DESC
    LIMIT ${limit}
  `;
}
