import { Prisma } from "@prisma/client";
import type { ModifierGroup, ModifierOption, MenuItemModifierGroup } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import {
  MenuItemNotFoundError,
  ModifierGroupAlreadyAttachedError,
  ModifierGroupNotFoundError,
  ModifierOptionNotFoundError,
} from "./menu-commerce.errors";
import type {
  AttachModifierGroupInput,
  CreateModifierGroupInput,
  CreateModifierOptionInput,
  UpdateModifierGroupInput,
  UpdateModifierOptionInput,
} from "./menu-commerce.validation";

export type ModifierGroupWithOptions = ModifierGroup & { options: ModifierOption[] };

// --- ModifierGroup ------------------------------------------------------------

export async function listModifierGroups(restaurantId: string): Promise<ModifierGroupWithOptions[]> {
  return prisma.modifierGroup.findMany({
    where: { restaurantId },
    include: { options: { orderBy: { sortOrder: "asc" } } },
  });
}

export async function createModifierGroup(
  restaurantId: string,
  input: CreateModifierGroupInput,
): Promise<ModifierGroup> {
  return prisma.modifierGroup.create({ data: { restaurantId, ...input } });
}

async function findOwnModifierGroup(restaurantId: string, id: string): Promise<ModifierGroup> {
  const group = await prisma.modifierGroup.findUnique({ where: { id } });
  if (!group || group.restaurantId !== restaurantId) {
    throw new ModifierGroupNotFoundError();
  }
  return group;
}

export async function updateModifierGroup(
  restaurantId: string,
  id: string,
  input: UpdateModifierGroupInput,
): Promise<ModifierGroup> {
  const group = await findOwnModifierGroup(restaurantId, id);
  return prisma.modifierGroup.update({ where: { id: group.id }, data: input });
}

export async function deleteModifierGroup(restaurantId: string, id: string): Promise<void> {
  const group = await findOwnModifierGroup(restaurantId, id);
  await prisma.modifierGroup.delete({ where: { id: group.id } });
}

// --- ModifierOption -------------------------------------------------------------

export async function createModifierOption(
  restaurantId: string,
  modifierGroupId: string,
  input: CreateModifierOptionInput,
): Promise<ModifierOption> {
  await findOwnModifierGroup(restaurantId, modifierGroupId);
  return prisma.modifierOption.create({ data: { modifierGroupId, ...input } });
}

async function findOwnModifierOption(
  restaurantId: string,
  modifierGroupId: string,
  optionId: string,
): Promise<ModifierOption> {
  const option = await prisma.modifierOption.findUnique({ where: { id: optionId } });
  if (!option || option.modifierGroupId !== modifierGroupId) {
    throw new ModifierOptionNotFoundError();
  }
  await findOwnModifierGroup(restaurantId, modifierGroupId);
  return option;
}

export async function updateModifierOption(
  restaurantId: string,
  modifierGroupId: string,
  optionId: string,
  input: UpdateModifierOptionInput,
): Promise<ModifierOption> {
  const option = await findOwnModifierOption(restaurantId, modifierGroupId, optionId);
  return prisma.modifierOption.update({ where: { id: option.id }, data: input });
}

export async function deleteModifierOption(
  restaurantId: string,
  modifierGroupId: string,
  optionId: string,
): Promise<void> {
  const option = await findOwnModifierOption(restaurantId, modifierGroupId, optionId);
  await prisma.modifierOption.delete({ where: { id: option.id } });
}

// --- MenuItem <-> ModifierGroup attachment ---------------------------------------

async function findOwnMenuItem(restaurantId: string, menuItemId: string) {
  const item = await prisma.menuItem.findUnique({ where: { id: menuItemId } });
  if (!item || item.restaurantId !== restaurantId) {
    throw new MenuItemNotFoundError();
  }
  return item;
}

export async function attachModifierGroupToItem(
  restaurantId: string,
  menuItemId: string,
  input: AttachModifierGroupInput,
): Promise<void> {
  await findOwnMenuItem(restaurantId, menuItemId);
  await findOwnModifierGroup(restaurantId, input.modifierGroupId);

  try {
    await prisma.menuItemModifierGroup.create({
      data: { menuItemId, modifierGroupId: input.modifierGroupId, sortOrder: input.sortOrder ?? 0 },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ModifierGroupAlreadyAttachedError();
    }
    throw err;
  }
}

export async function detachModifierGroupFromItem(
  restaurantId: string,
  menuItemId: string,
  modifierGroupId: string,
): Promise<void> {
  await findOwnMenuItem(restaurantId, menuItemId);
  await prisma.menuItemModifierGroup.deleteMany({ where: { menuItemId, modifierGroupId } });
}

export async function listItemModifierGroups(restaurantId: string, menuItemId: string): Promise<MenuItemModifierGroup[]> {
  await findOwnMenuItem(restaurantId, menuItemId);
  return prisma.menuItemModifierGroup.findMany({ where: { menuItemId }, orderBy: { sortOrder: "asc" } });
}

/** Returns attached groups with their options nested, ordered by sortOrder — used by checkout to validate selections. */
export async function listModifierGroupsForItem(restaurantId: string, menuItemId: string) {
  await findOwnMenuItem(restaurantId, menuItemId);
  const attachments = await prisma.menuItemModifierGroup.findMany({
    where: { menuItemId },
    orderBy: { sortOrder: "asc" },
    include: { modifierGroup: { include: { options: { orderBy: { sortOrder: "asc" } } } } },
  });
  return attachments.map((a) => a.modifierGroup);
}
