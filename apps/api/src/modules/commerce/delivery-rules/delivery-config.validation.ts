import { z } from "zod";

export const updateDeliveryConfigSchema = z.object({
  isDeliveryEnabled: z.boolean().optional(),
  isPickupEnabled: z.boolean().optional(),
  isDineInEnabled: z.boolean().optional(),
  deliveryRadiusMiles: z.number().positive().nullable().optional(),
  maxDeliveryDistanceMiles: z.number().positive().nullable().optional(),
  minOrderCentsForDelivery: z.number().int().nonnegative().optional(),
  minOrderCentsForPickup: z.number().int().nonnegative().optional(),
});

export type UpdateDeliveryConfigInput = z.infer<typeof updateDeliveryConfigSchema>;
