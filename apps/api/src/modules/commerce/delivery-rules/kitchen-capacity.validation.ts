import { z } from "zod";

export const updateKitchenCapacitySchema = z.object({
  isAcceptingOrders: z.boolean().optional(),
  maxConcurrentOrders: z.number().int().positive().nullable().optional(),
  avgPrepTimeMinutes: z.number().int().positive().nullable().optional(),
});

export type UpdateKitchenCapacityInput = z.infer<typeof updateKitchenCapacitySchema>;
