import { z } from "zod";

const email = z.email();
const password = z.string().min(8).max(128);
const name = z.string().min(1).max(128);

export const registerSchema = z.object({ email, password, name });
export const loginSchema = z.object({ email, password, rememberMe: z.boolean().optional() });
export const createStaffSchema = z.object({ email, password, name });
export const setStaffActiveSchema = z.object({ isActive: z.boolean() });
export const requestPasswordResetSchema = z.object({ email });
export const confirmPasswordResetSchema = z.object({ token: z.string().min(1), newPassword: password });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });
export const verifyEmailSchema = z.object({ token: z.string().min(1) });
export const updateProfileSchema = z.object({
  name: name.optional(),
  phone: z.string().min(1).max(32).nullable().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type SetStaffActiveInput = z.infer<typeof setStaffActiveSchema>;
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;
export type ConfirmPasswordResetInput = z.infer<typeof confirmPasswordResetSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
