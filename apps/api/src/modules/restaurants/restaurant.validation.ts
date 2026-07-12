import { z } from "zod";

const name = z.string().min(1).max(128);
const optionalText = z.string().max(512).optional();

export const BUSINESS_TYPES = [
  "RESTAURANT",
  "COFFEE_SHOP",
  "DELI",
  "VAPE_SHOP",
  "CONVENIENCE_STORE",
  "BAKERY",
  "PIZZA",
  "RETAIL",
  "OTHER",
] as const;

export const SETUP_STEPS = [
  "BUSINESS_TYPE",
  "BUSINESS_INFO",
  "LOCATION",
  "PAYMENT_PROVIDER",
  "MENU_IMPORT",
  "WEBSITE_THEME",
  "DONE",
] as const;

// Sprint 18 — Business Setup Wizard step 1: only businessType is required
// to create the record; name defaults to a placeholder the owner fills in
// during step 2 (Business Info), so the wizard has something to attach
// progress to from the very first step.
export const createRestaurantSchema = z.object({
  name: name.optional(),
  businessType: z.enum(BUSINESS_TYPES).optional(),
  description: optionalText,
  address: optionalText,
  phone: z.string().max(32).optional(),
  // The *referrer's* shareable code (from a ?ref= link), not this
  // restaurant's own — see restaurant.service.ts's createRestaurant.
  referralCode: z.string().max(32).optional(),
});

export const updateRestaurantSchema = z.object({
  name: name.optional(),
  businessType: z.enum(BUSINESS_TYPES).optional(),
  description: optionalText,
  address: optionalText,
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  phone: z.string().max(32).optional(),
  isPublished: z.boolean().optional(),
});

export const setSetupStepSchema = z.object({
  setupStep: z.enum(SETUP_STEPS),
});

export const suspendRestaurantSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type CreateRestaurantInput = z.infer<typeof createRestaurantSchema>;
export type UpdateRestaurantInput = z.infer<typeof updateRestaurantSchema>;
export type SetSetupStepInput = z.infer<typeof setSetupStepSchema>;
export type SuspendRestaurantInput = z.infer<typeof suspendRestaurantSchema>;
