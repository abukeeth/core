import type { MenuItemInventory } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { MenuItemNotFoundError } from "./menu-commerce.errors";
import type { ToggleOutOfStockInput, UpdateInventoryInput } from "./menu-commerce.validation";

async function assertOwnMenuItem(restaurantId: string, menuItemId: string): Promise<void> {
  const item = await prisma.menuItem.findUnique({ where: { id: menuItemId } });
  if (!item || item.restaurantId !== restaurantId) {
    throw new MenuItemNotFoundError();
  }
}

/** Lazily creates a default inventory row (not tracked, in stock) on first access. */
export async function getInventory(restaurantId: string, menuItemId: string): Promise<MenuItemInventory> {
  await assertOwnMenuItem(restaurantId, menuItemId);
  return prisma.menuItemInventory.upsert({
    where: { menuItemId },
    create: { menuItemId, trackInventory: false, isTemporarilyOutOfStock: false },
    update: {},
  });
}

export async function updateInventory(
  restaurantId: string,
  menuItemId: string,
  input: UpdateInventoryInput,
): Promise<MenuItemInventory> {
  await getInventory(restaurantId, menuItemId);
  return prisma.menuItemInventory.update({ where: { menuItemId }, data: input });
}

/** Fast single-purpose PATCH for the frequent "86 it" action. */
export async function toggleOutOfStock(
  restaurantId: string,
  menuItemId: string,
  input: ToggleOutOfStockInput,
): Promise<MenuItemInventory> {
  await getInventory(restaurantId, menuItemId);
  return prisma.menuItemInventory.update({ where: { menuItemId }, data: input });
}

/**
 * PURE — no DB access. The function checkout imports directly to validate
 * cart items at order time. False if the item itself is unavailable, false
 * if temporarily 86'd, false if tracked inventory has hit zero, else true.
 */
export function isItemOrderable(
  item: { isAvailable: boolean },
  inventory: { isTemporarilyOutOfStock: boolean; trackInventory: boolean; quantityAvailable: number | null } | null,
): boolean {
  if (!item.isAvailable) return false;
  if (inventory?.isTemporarilyOutOfStock) return false;
  if (inventory?.trackInventory && inventory.quantityAvailable !== null && inventory.quantityAvailable <= 0) {
    return false;
  }
  return true;
}
