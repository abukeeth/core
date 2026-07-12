import type { CustomerFavorite, MenuItem } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { CustomerFavoriteNotFoundError } from "./customers.errors";
import type { CreateFavoriteInput } from "./customers.validation";

export type CustomerFavoriteWithItem = CustomerFavorite & {
  menuItem: Pick<MenuItem, "id" | "name" | "priceCents" | "isAvailable">;
};

export async function listFavorites(customerId: string): Promise<CustomerFavoriteWithItem[]> {
  return prisma.customerFavorite.findMany({
    where: { customerId },
    include: { menuItem: { select: { id: true, name: true, priceCents: true, isAvailable: true } } },
  });
}

export async function createFavorite(customerId: string, input: CreateFavoriteInput): Promise<CustomerFavorite> {
  return prisma.customerFavorite.create({ data: { customerId, ...input } });
}

export async function deleteFavorite(customerId: string, id: string): Promise<void> {
  const favorite = await prisma.customerFavorite.findUnique({ where: { id } });
  if (!favorite || favorite.customerId !== customerId) {
    throw new CustomerFavoriteNotFoundError();
  }
  await prisma.customerFavorite.delete({ where: { id: favorite.id } });
}
