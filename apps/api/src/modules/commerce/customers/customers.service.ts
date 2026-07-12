import { randomBytes } from "node:crypto";
import type { Customer } from "@prisma/client";
import { getStringEnv } from "../../../config/env";
import { hashPassword, verifyPassword } from "../../../lib/password";
import { prisma } from "../../../lib/prisma";
import { generateCustomerRefreshToken, hashCustomerRefreshToken, signCustomerAccessToken } from "./customer-jwt";
import {
  CustomerEmailInUseError,
  InvalidCustomerCredentialsError,
  InvalidCustomerRefreshTokenError,
  InvalidPasswordResetTokenError,
} from "./customers.errors";
import { sendPasswordResetEmail } from "../notifications/notifications.service";
import type { LoginCustomerInput, RegisterCustomerInput } from "./customers.validation";

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

export type PublicCustomer = Pick<Customer, "id" | "email" | "name" | "phone">;

export function toPublicCustomer(customer: Customer): PublicCustomer {
  return { id: customer.id, email: customer.email, name: customer.name, phone: customer.phone };
}

export async function registerCustomer(input: RegisterCustomerInput): Promise<Customer> {
  const existing = await prisma.customer.findUnique({ where: { email: input.email } });
  if (existing) {
    throw new CustomerEmailInUseError();
  }
  const passwordHash = await hashPassword(input.password);
  return prisma.customer.create({
    data: { email: input.email, name: input.name, phone: input.phone, passwordHash },
  });
}

export async function validateCustomerCredentials(input: LoginCustomerInput): Promise<Customer> {
  const customer = await prisma.customer.findUnique({ where: { email: input.email } });
  if (!customer?.passwordHash || !(await verifyPassword(customer.passwordHash, input.password))) {
    throw new InvalidCustomerCredentialsError();
  }
  return customer;
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  return prisma.customer.findUnique({ where: { id } });
}

export interface CustomerTokenPair {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/**
 * Issues a fresh access token plus a new opaque, DB-tracked refresh token
 * for this customer (Sprint 07.7 H-7) — mirrors auth.service.ts's
 * issueTokenPair for staff.
 */
export async function issueCustomerTokenPair(customerId: string): Promise<CustomerTokenPair> {
  const accessToken = signCustomerAccessToken(customerId);
  const { token, tokenHash, expiresAt } = generateCustomerRefreshToken();
  await prisma.customerRefreshToken.create({ data: { customerId, tokenHash, expiresAt } });
  return { accessToken, refreshToken: token, refreshExpiresAt: expiresAt };
}

export async function revokeAllCustomerRefreshTokens(customerId: string): Promise<void> {
  await prisma.customerRefreshToken.updateMany({
    where: { customerId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Looks up the presented refresh token by hash, rejects if not
 * found/expired/revoked, and rotates it: marks the old row revoked and
 * issues a brand-new token pair. Reuse of an already-rotated (or
 * otherwise revoked) token is treated as possible theft — every active
 * session for the customer is invalidated, mirroring auth.service.ts's
 * rotateRefreshToken.
 */
export async function rotateCustomerRefreshToken(presentedToken: string): Promise<{ customerId: string; tokens: CustomerTokenPair }> {
  const tokenHash = hashCustomerRefreshToken(presentedToken);
  const stored = await prisma.customerRefreshToken.findUnique({ where: { tokenHash } });

  if (!stored) {
    throw new InvalidCustomerRefreshTokenError();
  }

  if (stored.revokedAt) {
    await revokeAllCustomerRefreshTokens(stored.customerId);
    throw new InvalidCustomerRefreshTokenError();
  }

  if (stored.expiresAt < new Date()) {
    throw new InvalidCustomerRefreshTokenError();
  }

  await prisma.customerRefreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

  const tokens = await issueCustomerTokenPair(stored.customerId);
  return { customerId: stored.customerId, tokens };
}

/** Revokes the single presented refresh token — what logoutHandler now actually does (Sprint 07.7 H-7), beyond just clearing cookies. */
export async function revokeCustomerRefreshToken(presentedToken: string): Promise<void> {
  const tokenHash = hashCustomerRefreshToken(presentedToken);
  await prisma.customerRefreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Always resolves successfully regardless of whether the email matches an
 * account — standard enumeration-prevention practice (Sprint 07.7 H-6). If
 * it does match, stores a hashed, single-use, 1-hour reset token and emails
 * a reset link. sendPasswordResetEmail never throws (see
 * notifications.service.ts's sendNotification), so this function can't
 * fail partway in a way that would leak whether the email existed.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const customer = await prisma.customer.findUnique({ where: { email } });
  if (!customer) {
    return;
  }
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashCustomerRefreshToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  await prisma.customerPasswordResetToken.create({ data: { customerId: customer.id, tokenHash, expiresAt } });

  const resetLink = `${getStringEnv("FRONTEND_URL", "")}/reset-password?token=${token}`;
  await sendPasswordResetEmail(customer.id, customer.email, resetLink);
}

/**
 * Confirms a password reset — looks up the token by hash, rejects an
 * unknown/expired/already-used token with the same generic error (no
 * distinction between those cases in the response), updates the password,
 * marks the token used, and invalidates every existing session for the
 * customer (Sprint 07.7 H-6, built on H-7's revokeAllCustomerRefreshTokens).
 */
export async function resetPassword(presentedToken: string, newPassword: string): Promise<void> {
  const tokenHash = hashCustomerRefreshToken(presentedToken);
  const stored = await prisma.customerPasswordResetToken.findUnique({ where: { tokenHash } });

  if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
    throw new InvalidPasswordResetTokenError();
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.customer.update({ where: { id: stored.customerId }, data: { passwordHash } });
  await prisma.customerPasswordResetToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } });
  await revokeAllCustomerRefreshTokens(stored.customerId);
}

/**
 * Authenticated password change — re-verifies currentPassword before
 * allowing the change, same session-invalidation as resetPassword (Sprint
 * 07.7 H-6).
 */
export async function changePassword(customerId: string, currentPassword: string, newPassword: string): Promise<void> {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer?.passwordHash || !(await verifyPassword(customer.passwordHash, currentPassword))) {
    throw new InvalidCustomerCredentialsError();
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.customer.update({ where: { id: customerId }, data: { passwordHash } });
  await revokeAllCustomerRefreshTokens(customerId);
}
