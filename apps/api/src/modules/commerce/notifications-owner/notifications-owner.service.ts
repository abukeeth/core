import { prisma } from "../../../lib/prisma";

export interface OwnerNotification {
  id: string;
  type: string;
  status: string;
  channel: string;
  orderId: string | null;
  orderNumber: number | null;
  createdAt: Date;
}

/**
 * Owner-facing notification feed — the restaurant's real NotificationLog rows
 * (order/payment/driver/staff events). Scoped by restaurantId; the order
 * number is joined in for display. NotificationLog has no read/unread state,
 * so none is invented here.
 */
export async function listOwnerNotifications(restaurantId: string, limit: number): Promise<OwnerNotification[]> {
  const rows = await prisma.notificationLog.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      status: true,
      channel: true,
      orderId: true,
      createdAt: true,
      order: { select: { orderNumber: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    channel: r.channel,
    orderId: r.orderId,
    orderNumber: r.order?.orderNumber ?? null,
    createdAt: r.createdAt,
  }));
}
