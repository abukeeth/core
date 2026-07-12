import { z } from "zod";

export const updateLoyaltyProgramSchema = z.object({
  pointsPerDollarCents: z.number().int().nonnegative().optional(),
  redemptionRateCentsPerPoint: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

export type UpdateLoyaltyProgramInput = z.infer<typeof updateLoyaltyProgramSchema>;

export const redeemLoyaltyPointsSchema = z.object({
  points: z.number().int().positive(),
});

export type RedeemLoyaltyPointsInput = z.infer<typeof redeemLoyaltyPointsSchema>;
