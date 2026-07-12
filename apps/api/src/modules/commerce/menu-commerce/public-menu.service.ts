import { prisma } from "../../../lib/prisma";
import { RestaurantNotFoundError } from "../../restaurants/restaurant.errors";
import { isItemOrderable } from "./inventory.service";

export interface PublicMenuItem {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  isOrderable: boolean;
  variants: { id: string; name: string; priceDeltaCents: number; isDefault: boolean }[];
  modifierGroups: {
    id: string;
    name: string;
    selectionType: "SINGLE" | "MULTIPLE";
    isRequired: boolean;
    minSelections: number;
    maxSelections: number | null;
    options: { id: string; name: string; priceDeltaCents: number; isAvailable: boolean }[];
  }[];
}

export interface PublicMenuCategory {
  id: string;
  name: string;
  items: PublicMenuItem[];
}

/**
 * The live menu a diner browses to build a cart — distinct from the
 * generated marketing site's static Menu page. Only ever exposes
 * published restaurants; unpublished ones 404 exactly like a nonexistent
 * one (never leaking existence via a 403).
 */
export async function getPublicMenu(restaurantId: string): Promise<{
  restaurant: { id: string; name: string; description: string | null; address: string | null };
  categories: PublicMenuCategory[];
}> {
  const restaurant = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
  if (!restaurant || !restaurant.isPublished) {
    throw new RestaurantNotFoundError();
  }

  const categories = await prisma.menuCategory.findMany({
    where: { restaurantId },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        where: { isAvailable: true },
        orderBy: { sortOrder: "asc" },
        include: {
          variants: { orderBy: { sortOrder: "asc" } },
          inventory: true,
          modifierGroups: {
            orderBy: { sortOrder: "asc" },
            include: { modifierGroup: { include: { options: { orderBy: { sortOrder: "asc" } } } } },
          },
        },
      },
    },
  });

  return {
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      description: restaurant.description,
      address: restaurant.address,
    },
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      items: category.items.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        priceCents: item.priceCents,
        isOrderable: isItemOrderable(item, item.inventory),
        variants: item.variants.map((v) => ({
          id: v.id,
          name: v.name,
          priceDeltaCents: v.priceDeltaCents,
          isDefault: v.isDefault,
        })),
        modifierGroups: item.modifierGroups.map((attachment) => ({
          id: attachment.modifierGroup.id,
          name: attachment.modifierGroup.name,
          selectionType: attachment.modifierGroup.selectionType,
          isRequired: attachment.modifierGroup.isRequired,
          minSelections: attachment.modifierGroup.minSelections,
          maxSelections: attachment.modifierGroup.maxSelections,
          options: attachment.modifierGroup.options.map((o) => ({
            id: o.id,
            name: o.name,
            priceDeltaCents: o.priceDeltaCents,
            isAvailable: o.isAvailable,
          })),
        })),
      })),
    })),
  };
}
