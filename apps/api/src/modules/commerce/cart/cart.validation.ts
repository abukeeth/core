import { z } from "zod";

export const createCartSchema = z.object({
  fulfillmentType: z.enum(["PICKUP", "DELIVERY", "DINE_IN"]).default("PICKUP"),
});

export const addCartItemSchema = z.object({
  menuItemId: z.uuid(),
  variantId: z.uuid().optional(),
  quantity: z.number().int().positive().default(1),
  modifierOptionIds: z.array(z.uuid()).default([]),
  notes: z.string().max(256).optional(),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().positive(),
});

export const setFulfillmentSchema = z.object({
  fulfillmentType: z.enum(["PICKUP", "DELIVERY", "DINE_IN"]),
  scheduledFor: z.coerce.date().optional(),
  deliveryAddressId: z.uuid().optional(),
});

export const applyCouponSchema = z.object({
  code: z.string().min(1).max(32),
});

export const applyLoyaltyRedemptionSchema = z.object({
  points: z.number().int().positive(),
});

// A table is bound to a cart only via a scanned QR token, never a raw
// client-supplied tableId — the token is resolved to a real Table row
// server-side (see bindCartToTable in cart.service.ts).
export const bindTableSchema = z.object({
  qrToken: z.string().min(1),
});

export type CreateCartInput = z.infer<typeof createCartSchema>;
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
export type SetFulfillmentInput = z.infer<typeof setFulfillmentSchema>;
export type ApplyCouponInput = z.infer<typeof applyCouponSchema>;
export type ApplyLoyaltyRedemptionInput = z.infer<typeof applyLoyaltyRedemptionSchema>;
export type BindTableInput = z.infer<typeof bindTableSchema>;
