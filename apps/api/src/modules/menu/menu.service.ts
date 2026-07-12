import type { MenuCategory, MenuItem } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { CategoryNotFoundError, ItemNotFoundError } from "./menu.errors";
import type { CreateCategoryInput, CreateItemInput, UpdateCategoryInput, UpdateItemInput } from "./menu.validation";

export async function listCategories(restaurantId: string): Promise<(MenuCategory & { items: MenuItem[] })[]> {
  return prisma.menuCategory.findMany({
    where: { restaurantId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
    orderBy: { sortOrder: "asc" },
  });
}

export async function createCategory(restaurantId: string, input: CreateCategoryInput): Promise<MenuCategory> {
  return prisma.menuCategory.create({ data: { restaurantId, ...input } });
}

async function findOwnCategory(restaurantId: string, categoryId: string): Promise<MenuCategory> {
  const category = await prisma.menuCategory.findUnique({ where: { id: categoryId } });
  if (!category || category.restaurantId !== restaurantId) {
    throw new CategoryNotFoundError();
  }
  return category;
}

export async function updateCategory(
  restaurantId: string,
  categoryId: string,
  input: UpdateCategoryInput,
): Promise<MenuCategory> {
  const category = await findOwnCategory(restaurantId, categoryId);
  return prisma.menuCategory.update({ where: { id: category.id }, data: input });
}

export async function deleteCategory(restaurantId: string, categoryId: string): Promise<void> {
  const category = await findOwnCategory(restaurantId, categoryId);
  await prisma.$transaction([
    prisma.menuItem.deleteMany({ where: { categoryId: category.id } }),
    prisma.menuCategory.delete({ where: { id: category.id } }),
  ]);
}

async function findOwnItem(restaurantId: string, itemId: string): Promise<MenuItem> {
  const item = await prisma.menuItem.findUnique({ where: { id: itemId } });
  if (!item || item.restaurantId !== restaurantId) {
    throw new ItemNotFoundError();
  }
  return item;
}

export async function createItem(restaurantId: string, input: CreateItemInput): Promise<MenuItem> {
  await findOwnCategory(restaurantId, input.categoryId);
  return prisma.menuItem.create({ data: { restaurantId, ...input } });
}

export async function updateItem(restaurantId: string, itemId: string, input: UpdateItemInput): Promise<MenuItem> {
  const item = await findOwnItem(restaurantId, itemId);
  if (input.categoryId) {
    await findOwnCategory(restaurantId, input.categoryId);
  }
  return prisma.menuItem.update({ where: { id: item.id }, data: input });
}

export async function deleteItem(restaurantId: string, itemId: string): Promise<void> {
  const item = await findOwnItem(restaurantId, itemId);
  await prisma.menuItem.delete({ where: { id: item.id } });
}
