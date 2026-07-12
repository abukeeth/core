/**
 * Typed errors for the menu-commerce module (variants, modifiers, inventory).
 * Mirrors the pattern in ../../menu/menu.errors.ts: every "not found or not
 * owned by this restaurant" case throws one of these rather than a generic
 * Error, so controllers can map them to 404s without ever leaking a 403
 * (see tenant-isolation rule: cross-tenant access always looks like
 * not-found, never forbidden).
 */

export class MenuItemNotFoundError extends Error {
  constructor() {
    super("Menu item not found");
  }
}

export class VariantNotFoundError extends Error {
  constructor() {
    super("Menu item variant not found");
  }
}

export class ModifierGroupNotFoundError extends Error {
  constructor() {
    super("Modifier group not found");
  }
}

export class ModifierOptionNotFoundError extends Error {
  constructor() {
    super("Modifier option not found");
  }
}

export class InventoryNotFoundError extends Error {
  constructor() {
    super("Menu item inventory record not found");
  }
}

/**
 * Thrown when attaching a ModifierGroup to a MenuItem that already has it
 * attached (unique [menuItemId, modifierGroupId] constraint violation,
 * Prisma P2002) — mapped to this typed error instead of a raw 500.
 */
export class ModifierGroupAlreadyAttachedError extends Error {
  constructor() {
    super("Modifier group is already attached to this menu item");
  }
}
