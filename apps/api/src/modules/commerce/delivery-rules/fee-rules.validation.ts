import { z } from "zod";

export const createDeliveryFeeRuleSchema = z.object({
  name: z.string().min(1).max(128).optional(),
  minDistanceMiles: z.number().nonnegative().optional(),
  maxDistanceMiles: z.number().nonnegative().optional(),
  feeType: z.enum(["FLAT", "PER_MILE", "PERCENTAGE_OF_SUBTOTAL"]),
  feeValue: z.number().int().nonnegative(),
  priority: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const updateDeliveryFeeRuleSchema = createDeliveryFeeRuleSchema.partial();

export const createServiceFeeRuleSchema = z.object({
  name: z.string().min(1).max(128),
  feeType: z.enum(["FLAT", "PERCENTAGE_OF_SUBTOTAL"]),
  feeValue: z.number().int().nonnegative(),
  appliesTo: z.enum(["ALL_ORDERS", "DELIVERY_ONLY", "PICKUP_ONLY", "DINE_IN_ONLY"]).optional(),
  isActive: z.boolean().optional(),
});

export const updateServiceFeeRuleSchema = createServiceFeeRuleSchema.partial();

export type CreateDeliveryFeeRuleInput = z.infer<typeof createDeliveryFeeRuleSchema>;
export type UpdateDeliveryFeeRuleInput = z.infer<typeof updateDeliveryFeeRuleSchema>;
export type CreateServiceFeeRuleInput = z.infer<typeof createServiceFeeRuleSchema>;
export type UpdateServiceFeeRuleInput = z.infer<typeof updateServiceFeeRuleSchema>;
