import type { MenuItemVariant } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { MenuItemNotFoundError, VariantNotFoundError } from "./menu-commerce.errors";
import type { CreateVariantInput, UpdateVariantInput } from "./menu-commerce.validation";

async function findOwnMenuItem(restaurantId: string, menuItemId: string) {
  const item = await prisma.menuItem.findUnique({ where: { id: menuItemId } });
  if (!item || item.restaurantId !== restaurantId) {
    throw new MenuItemNotFoundError();
  }
  return item;
}

export async function listVariants(restaurantId: string, menuItemId: string): Promise<MenuItemVariant[]> {
  await findOwnMenuItem(restaurantId, menuItemId);
  return prisma.menuItemVariant.findMany({ where: { menuItemId }, orderBy: { sortOrder: "asc" } });
}

export async function createVariant(
  restaurantId: string,
  menuItemId: string,
  input: CreateVariantInput,
): Promise<MenuItemVariant> {
  await findOwnMenuItem(restaurantId, menuItemId);
  return prisma.menuItemVariant.create({ data: { menuItemId, ...input } });
}

async function findOwnVariant(restaurantId: string, menuItemId: string, variantId: string): Promise<MenuItemVariant> {
  const variant = await prisma.menuItemVariant.findUnique({ where: { id: variantId } });
  if (!variant || variant.menuItemId !== menuItemId) {
    throw new VariantNotFoundError();
  }
  await findOwnMenuItem(restaurantId, menuItemId);
  return variant;
}

export async function updateVariant(
  restaurantId: string,
  menuItemId: string,
  variantId: string,
  input: UpdateVariantInput,
): Promise<MenuItemVariant> {
  const variant = await findOwnVariant(restaurantId, menuItemId, variantId);
  return prisma.menuItemVariant.update({ where: { id: variant.id }, data: input });
}

export async function deleteVariant(restaurantId: string, menuItemId: string, variantId: string): Promise<void> {
  const variant = await findOwnVariant(restaurantId, menuItemId, variantId);
  await prisma.menuItemVariant.delete({ where: { id: variant.id } });
}
