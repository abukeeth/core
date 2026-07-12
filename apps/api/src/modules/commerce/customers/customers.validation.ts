import { z } from "zod";

const email = z.email();
const password = z.string().min(8).max(128);
const name = z.string().min(1).max(128);

export const registerCustomerSchema = z.object({ email, password, name, phone: z.string().max(32).optional() });
export const loginCustomerSchema = z.object({ email, password });

export type RegisterCustomerInput = z.infer<typeof registerCustomerSchema>;
export type LoginCustomerInput = z.infer<typeof loginCustomerSchema>;

export const requestPasswordResetSchema = z.object({ email });
export const confirmPasswordResetSchema = z.object({ token: z.string().min(1), newPassword: password });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });

export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;
export type ConfirmPasswordResetInput = z.infer<typeof confirmPasswordResetSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const createAddressSchema = z.object({
  label: z.string().max(64).optional(),
  line1: z.string().min(1).max(256),
  line2: z.string().max(256).optional(),
  city: z.string().min(1).max(128),
  state: z.string().min(1).max(64),
  postalCode: z.string().min(1).max(32),
  country: z.string().min(1).max(64),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  isDefault: z.boolean().optional(),
});

export const updateAddressSchema = createAddressSchema.partial();

export type CreateAddressInput = z.infer<typeof createAddressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;

export const createFavoriteSchema = z.object({
  restaurantId: z.uuid(),
  menuItemId: z.uuid(),
});

export type CreateFavoriteInput = z.infer<typeof createFavoriteSchema>;

export const createPaymentMethodSchema = z.object({
  providerId: z.uuid(),
  providerToken: z.string().min(1),
  brand: z.string().max(32).optional(),
  last4: z.string().length(4).optional(),
  expMonth: z.number().int().min(1).max(12).optional(),
  expYear: z.number().int().min(2000).optional(),
  isDefault: z.boolean().optional(),
});

export type CreatePaymentMethodInput = z.infer<typeof createPaymentMethodSchema>;
