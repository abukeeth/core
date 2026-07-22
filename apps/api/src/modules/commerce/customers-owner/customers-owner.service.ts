import { prisma } from "../../../lib/prisma";

// "Real" orders exclude never-charged states, matching the analytics module's
// revenue definition (see analytics.service.ts).
const NOT_REAL_ORDER_STATUSES = ["CANCELLED", "FAILED"] as const;

export interface OwnerCustomerRow {
  id: string;
  kind: "registered" | "guest";
  name: string;
  email: string;
  phone: string | null;
  orderCount: number;
  totalSpentCents: number;
  lastOrderAt: Date | null;
}

/**
 * Owner-facing customer list, derived entirely from this restaurant's order
 * history — no separate "customer directory" table is maintained. Registered
 * `Customer`s and one-off `GuestCustomer`s are unioned; guests may appear more
 * than once because `GuestCustomer.email` is intentionally not unique (a new
 * row can be created per guest checkout). Scoped to the caller's restaurant.
 */
export async function listOwnerCustomers(restaurantId: string, limit: number): Promise<OwnerCustomerRow[]> {
  return prisma.$queryRaw<OwnerCustomerRow[]>`
    SELECT c.id AS id, 'registered' AS kind, c.name AS name, c.email AS email, c.phone AS phone,
           COUNT(o.id)::int AS "orderCount",
           COALESCE(SUM(o."totalCents"), 0)::int AS "totalSpentCents",
           MAX(o."createdAt") AS "lastOrderAt"
    FROM "Order" o
    JOIN "Customer" c ON c.id = o."customerId"
    WHERE o."restaurantId" = ${restaurantId} AND o."status" NOT IN ('CANCELLED', 'FAILED')
    GROUP BY c.id
    UNION ALL
    SELECT g.id AS id, 'guest' AS kind, g.name AS name, g.email AS email, g.phone AS phone,
           COUNT(o.id)::int AS "orderCount",
           COALESCE(SUM(o."totalCents"), 0)::int AS "totalSpentCents",
           MAX(o."createdAt") AS "lastOrderAt"
    FROM "Order" o
    JOIN "GuestCustomer" g ON g.id = o."guestCustomerId"
    WHERE o."restaurantId" = ${restaurantId} AND o."status" NOT IN ('CANCELLED', 'FAILED')
    GROUP BY g.id
    ORDER BY "lastOrderAt" DESC NULLS LAST
    LIMIT ${limit}
  `;
}

export interface OwnerCustomerMetrics {
  totalCustomers: number;
  returningCount: number;
  returningRate: number; // 0..1
  avgSpentCents: number;
  avgOrders: number;
  vipCount: number; // customers with >= 5 real orders
}

export async function getOwnerCustomerMetrics(restaurantId: string): Promise<OwnerCustomerMetrics> {
  const rows = await prisma.$queryRaw<
    { totalCustomers: number; returningCount: number; avgSpentCents: number; avgOrders: number; vipCount: number }[]
  >`
    WITH cust AS (
      SELECT c.id AS id, COUNT(o.id)::int AS oc, COALESCE(SUM(o."totalCents"), 0)::int AS spent
      FROM "Order" o JOIN "Customer" c ON c.id = o."customerId"
      WHERE o."restaurantId" = ${restaurantId} AND o."status" NOT IN ('CANCELLED', 'FAILED')
      GROUP BY c.id
      UNION ALL
      SELECT g.id AS id, COUNT(o.id)::int AS oc, COALESCE(SUM(o."totalCents"), 0)::int AS spent
      FROM "Order" o JOIN "GuestCustomer" g ON g.id = o."guestCustomerId"
      WHERE o."restaurantId" = ${restaurantId} AND o."status" NOT IN ('CANCELLED', 'FAILED')
      GROUP BY g.id
    )
    SELECT COUNT(*)::int AS "totalCustomers",
           COUNT(*) FILTER (WHERE oc > 1)::int AS "returningCount",
           COALESCE(ROUND(AVG(spent)), 0)::int AS "avgSpentCents",
           COALESCE(AVG(oc), 0)::float AS "avgOrders",
           COUNT(*) FILTER (WHERE oc >= 5)::int AS "vipCount"
    FROM cust
  `;
  const r = rows[0] ?? { totalCustomers: 0, returningCount: 0, avgSpentCents: 0, avgOrders: 0, vipCount: 0 };
  return {
    totalCustomers: r.totalCustomers,
    returningCount: r.returningCount,
    returningRate: r.totalCustomers > 0 ? r.returningCount / r.totalCustomers : 0,
    avgSpentCents: r.avgSpentCents,
    avgOrders: r.avgOrders,
    vipCount: r.vipCount,
  };
}

export interface OwnerCustomerOrder {
  id: string;
  orderNumber: number;
  status: string;
  fulfillmentType: string;
  totalCents: number;
  placedAt: Date;
}

export interface OwnerCustomerDetail {
  id: string;
  kind: "registered" | "guest";
  name: string;
  email: string;
  phone: string | null;
  createdAt: Date;
  metrics: {
    orderCount: number;
    totalSpentCents: number;
    avgOrderCents: number;
    lastOrderAt: Date | null;
    firstOrderAt: Date | null;
  };
  orders: OwnerCustomerOrder[];
}

/**
 * Full profile for one customer. Returns null unless the customer has at least
 * one order at this restaurant — this is the tenant-isolation guard that stops
 * an owner reading the PII of a diner who has never ordered from them.
 */
export async function getOwnerCustomerDetail(restaurantId: string, customerId: string): Promise<OwnerCustomerDetail | null> {
  const registered = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true, email: true, phone: true, createdAt: true },
  });
  const guest = registered
    ? null
    : await prisma.guestCustomer.findUnique({
        where: { id: customerId },
        select: { id: true, name: true, email: true, phone: true, createdAt: true },
      });
  const identity = registered ?? guest;
  if (!identity) return null;

  const kind: "registered" | "guest" = registered ? "registered" : "guest";
  const orderWhere = kind === "registered" ? { customerId } : { guestCustomerId: customerId };

  const [agg, orders] = await Promise.all([
    prisma.order.aggregate({
      where: { restaurantId, ...orderWhere, status: { notIn: [...NOT_REAL_ORDER_STATUSES] } },
      _sum: { totalCents: true },
      _avg: { totalCents: true },
      _count: true,
      _max: { createdAt: true },
      _min: { createdAt: true },
    }),
    prisma.order.findMany({
      where: { restaurantId, ...orderWhere },
      select: { id: true, orderNumber: true, status: true, fulfillmentType: true, totalCents: true, placedAt: true },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  if (orders.length === 0) return null;

  return {
    id: identity.id,
    kind,
    name: identity.name,
    email: identity.email,
    phone: identity.phone,
    createdAt: identity.createdAt,
    metrics: {
      orderCount: agg._count,
      totalSpentCents: agg._sum.totalCents ?? 0,
      avgOrderCents: Math.round(agg._avg.totalCents ?? 0),
      lastOrderAt: agg._max.createdAt ?? null,
      firstOrderAt: agg._min.createdAt ?? null,
    },
    orders,
  };
}
