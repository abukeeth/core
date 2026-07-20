import { z } from "zod";

const email = z.email();
const password = z.string().min(8).max(128);
const name = z.string().min(1).max(128);

export const registerSchema = z.object({ email, password, name });
export const loginSchema = z.object({ email, password, rememberMe: z.boolean().optional() });
// P2.6.1-pre-a — an owner may invite a staff member as either general STAFF
// (default) or KITCHEN. This selects the scoped Membership role only; the
// legacy User.role always stays RESTAURANT_STAFF. Only these two values are
// accepted here — OWNER/ADMIN/MANAGER/MARKETING/SUPPORT are rejected.
export const staffMembershipRoleSchema = z.enum(["STAFF", "KITCHEN"]);
export const createStaffSchema = z.object({
  email,
  password,
  name,
  membershipRole: staffMembershipRoleSchema.default("STAFF"),
});
export const setStaffActiveSchema = z.object({ isActive: z.boolean() });
// P2.6.1-pre-b — reassign an existing staff member's scoped Membership between
// STAFF and KITCHEN. Required (no default): reassignment is an explicit action.
// Reuses the pre-a enum, so OWNER/ADMIN/MANAGER/MARKETING/SUPPORT are rejected.
export const reassignStaffRoleSchema = z.object({ membershipRole: staffMembershipRoleSchema });
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
// `z.input` (not `z.infer`/output): membershipRole is optional at the call
// boundary — the schema applies the STAFF default, and createStaff also treats
// an omitted value as STAFF, so callers may omit it for backward compatibility.
export type CreateStaffInput = z.input<typeof createStaffSchema>;
export type SetStaffActiveInput = z.infer<typeof setStaffActiveSchema>;
export type ReassignStaffRoleInput = z.infer<typeof reassignStaffRoleSchema>;
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;
export type ConfirmPasswordResetInput = z.infer<typeof confirmPasswordResetSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
