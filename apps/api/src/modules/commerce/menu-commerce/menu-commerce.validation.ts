import { ModifierSelectionType } from "@prisma/client";
import { z } from "zod";

const name = z.string().min(1).max(128);
const priceDeltaCents = z.number().int();
const sortOrder = z.number().int().default(0);
const selectionType = z.enum(ModifierSelectionType);
const minSelections = z.number().int().nonnegative();
const maxSelections = z.number().int().positive();

// --- Variants ---------------------------------------------------------------

export const createVariantSchema = z.object({
  name,
  priceDeltaCents: priceDeltaCents.default(0),
  sortOrder: sortOrder.optional(),
  isDefault: z.boolean().optional(),
});

export const updateVariantSchema = z.object({
  name: name.optional(),
  priceDeltaCents: priceDeltaCents.optional(),
  sortOrder: sortOrder.optional(),
  isDefault: z.boolean().optional(),
});

export type CreateVariantInput = z.infer<typeof createVariantSchema>;
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;

// --- Modifier groups ---------------------------------------------------------
//
// A SINGLE-selection group only ever allows exactly one option to be picked,
// so `maxSelections` is forced to 1: if the caller supplies it, it must be 1;
// if omitted, the create schema defaults it to 1. `minSelections <=
// maxSelections` is enforced whenever both are known.

export const createModifierGroupSchema = z
  .object({
    name,
    selectionType,
    isRequired: z.boolean().optional(),
    minSelections: minSelections.optional().default(0),
    maxSelections: maxSelections.optional(),
  })
  .transform((data) => {
    if (data.selectionType === "SINGLE" && data.maxSelections === undefined) {
      return { ...data, maxSelections: 1 };
    }
    return data;
  })
  .refine((data) => data.selectionType !== "SINGLE" || data.maxSelections === 1, {
    message: "maxSelections must be 1 for a SINGLE-selection modifier group",
    path: ["maxSelections"],
  })
  .refine((data) => data.maxSelections === undefined || data.minSelections <= data.maxSelections, {
    message: "minSelections must be less than or equal to maxSelections",
    path: ["minSelections"],
  });

export const updateModifierGroupSchema = z
  .object({
    name: name.optional(),
    selectionType: selectionType.optional(),
    isRequired: z.boolean().optional(),
    minSelections: minSelections.optional(),
    maxSelections: maxSelections.optional(),
  })
  .refine((data) => data.selectionType !== "SINGLE" || data.maxSelections === undefined || data.maxSelections === 1, {
    message: "maxSelections must be 1 for a SINGLE-selection modifier group",
    path: ["maxSelections"],
  })
  .refine(
    (data) => data.minSelections === undefined || data.maxSelections === undefined || data.minSelections <= data.maxSelections,
    {
      message: "minSelections must be less than or equal to maxSelections",
      path: ["minSelections"],
    },
  );

export type CreateModifierGroupInput = z.infer<typeof createModifierGroupSchema>;
export type UpdateModifierGroupInput = z.infer<typeof updateModifierGroupSchema>;

// --- Modifier options ---------------------------------------------------------

export const createModifierOptionSchema = z.object({
  name,
  priceDeltaCents: priceDeltaCents.default(0),
  isAvailable: z.boolean().optional(),
  sortOrder: sortOrder.optional(),
});

export const updateModifierOptionSchema = z.object({
  name: name.optional(),
  priceDeltaCents: priceDeltaCents.optional(),
  isAvailable: z.boolean().optional(),
  sortOrder: sortOrder.optional(),
});

export type CreateModifierOptionInput = z.infer<typeof createModifierOptionSchema>;
export type UpdateModifierOptionInput = z.infer<typeof updateModifierOptionSchema>;

// --- Menu item <-> modifier group attachment ---------------------------------

export const attachModifierGroupSchema = z.object({
  modifierGroupId: z.uuid(),
  sortOrder: sortOrder.optional(),
});

export type AttachModifierGroupInput = z.infer<typeof attachModifierGroupSchema>;

// --- Inventory ---------------------------------------------------------------

export const updateInventorySchema = z.object({
  trackInventory: z.boolean().optional(),
  quantityAvailable: z.number().int().nullable().optional(),
  lowStockThreshold: z.number().int().nullable().optional(),
  isTemporarilyOutOfStock: z.boolean().optional(),
  outOfStockUntil: z.coerce.date().nullable().optional(),
});

export const toggleOutOfStockSchema = z.object({
  isTemporarilyOutOfStock: z.boolean(),
  outOfStockUntil: z.coerce.date().nullable().optional(),
});

export type UpdateInventoryInput = z.infer<typeof updateInventorySchema>;
export type ToggleOutOfStockInput = z.infer<typeof toggleOutOfStockSchema>;
