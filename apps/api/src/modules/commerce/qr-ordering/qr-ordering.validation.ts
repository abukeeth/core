import { z } from "zod";

export const createTableSchema = z.object({
  label: z.string().min(1).max(64),
});

export const updateTableSchema = z.object({
  label: z.string().min(1).max(64).optional(),
  isActive: z.boolean().optional(),
});

export type CreateTableInput = z.infer<typeof createTableSchema>;
export type UpdateTableInput = z.infer<typeof updateTableSchema>;
