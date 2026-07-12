import { z } from "zod";

const code = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[A-Za-z0-9-]+$/)
  .transform((s) => s.toUpperCase());

export const createCouponSchema = z.object({
  code,
  type: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "FREE_DELIVERY"]),
  value: z.number().int().nonnegative(),
  minOrderCents: z.number().int().nonnegative().optional(),
  maxDiscountCents: z.number().int().nonnegative().optional(),
  startsAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  maxRedemptions: z.number().int().positive().optional(),
  maxRedemptionsPerCustomer: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

export const updateCouponSchema = z.object({
  type: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "FREE_DELIVERY"]).optional(),
  value: z.number().int().nonnegative().optional(),
  minOrderCents: z.number().int().nonnegative().optional(),
  maxDiscountCents: z.number().int().nonnegative().optional(),
  startsAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  maxRedemptions: z.number().int().positive().optional(),
  maxRedemptionsPerCustomer: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
