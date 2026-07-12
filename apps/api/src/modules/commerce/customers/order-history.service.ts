import type { Order, Restaurant } from "@prisma/client";
import { prisma } from "../../../lib/prisma";

export type CustomerOrderSummary = Pick<Order, "id" | "orderNumber" | "status" | "totalCents" | "createdAt"> & {
  restaurant: Pick<Restaurant, "id" | "name">;
};

export async function listCustomerOrders(customerId: string): Promise<CustomerOrderSummary[]> {
  return prisma.order.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      totalCents: true,
      createdAt: true,
      restaurant: { select: { id: true, name: true } },
    },
  });
}
