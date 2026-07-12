import { z } from "zod";

const name = z.string().min(1).max(128);
const sortOrder = z.number().int().default(0);

export const createCategorySchema = z.object({ name, sortOrder: sortOrder.optional() });
export const updateCategorySchema = z.object({ name: name.optional(), sortOrder: sortOrder.optional() });

export const createItemSchema = z.object({
  categoryId: z.uuid(),
  name,
  description: z.string().max(512).optional(),
  priceCents: z.number().int().nonnegative(),
  isAvailable: z.boolean().optional(),
  sortOrder: sortOrder.optional(),
});

export const updateItemSchema = z.object({
  categoryId: z.uuid().optional(),
  name: name.optional(),
  description: z.string().max(512).optional(),
  priceCents: z.number().int().nonnegative().optional(),
  isAvailable: z.boolean().optional(),
  sortOrder: sortOrder.optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
