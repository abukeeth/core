import { randomBytes } from "node:crypto";
import { Role, type User } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { getStringEnv } from "../../config/env";
import { generateRefreshToken, hashToken, signAccessToken } from "../../lib/jwt";
import { hashPassword, verifyPassword } from "../../lib/password";
import { sendEmailVerificationEmail, sendOwnerPasswordResetEmail } from "../commerce/notifications/notifications.service";
import {
  AccountDeactivatedError,
  EmailInUseError,
  InvalidCredentialsError,
  InvalidEmailVerificationTokenError,
  InvalidPasswordResetTokenError,
  InvalidRefreshTokenError,
  StaffNotFoundError,
} from "./auth.errors";
import type {
  ChangePasswordInput,
  CreateStaffInput,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
} from "./auth.validation";

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export type PublicUser = Pick<User, "id" | "email" | "name" | "role" | "isActive" | "emailVerified" | "phone">;

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    emailVerified: user.emailVerified,
    phone: user.phone,
  };
}

export interface StaffSummary {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  createdAt: Date;
}

async function assertEmailAvailable(email: string): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new EmailInUseError();
  }
}

export async function registerOwner(input: RegisterInput): Promise<User> {
  await assertEmailAvailable(input.email);
  const passwordHash = await hashPassword(input.password);
  return prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash,
      role: Role.RESTAURANT_OWNER,
    },
  });
}

export async function createStaff(ownerId: string, input: CreateStaffInput): Promise<User> {
  await assertEmailAvailable(input.email);
  const passwordHash = await hashPassword(input.password);
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { restaurantId: true } });
  return prisma.user.create({
    data: {
      email: input.email,
      name: input.name,
      passwordHash,
      role: Role.RESTAURANT_STAFF,
      invitedById: ownerId,
      restaurantId: owner?.restaurantId ?? null,
    },
  });
}

export async function listStaff(ownerId: string): Promise<StaffSummary[]> {
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { restaurantId: true } });
  if (!owner?.restaurantId) {
    return [];
  }
  const staff = await prisma.user.findMany({
    where: { restaurantId: owner.restaurantId, role: Role.RESTAURANT_STAFF },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, phone: true, isActive: true, createdAt: true },
  });
  return staff;
}

export async function setStaffActive(ownerId: string, staffId: string, isActive: boolean): Promise<StaffSummary> {
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { restaurantId: true } });
  const staff = await prisma.user.findUnique({ where: { id: staffId } });
  if (!staff || staff.role !== Role.RESTAURANT_STAFF || staff.restaurantId !== owner?.restaurantId) {
    throw new StaffNotFoundError();
  }

  const updated = await prisma.user.update({ where: { id: staffId }, data: { isActive } });
  if (!isActive) {
    await revokeAllRefreshTokensForUser(staffId);
  }
  return {
    id: updated.id,
    name: updated.name,
    email: updated.email,
    phone: updated.phone,
    isActive: updated.isActive,
    createdAt: updated.createdAt,
  };
}

export async function validateCredentials(input: LoginInput): Promise<User> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await verifyPassword(user.passwordHash, input.password))) {
    throw new InvalidCredentialsError();
  }
  if (!user.isActive) {
    throw new AccountDeactivatedError();
  }
  return user;
}

export async function issueTokenPair(user: User, rememberMe = true): Promise<TokenPair> {
  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const { token, tokenHash, expiresAt } = generateRefreshToken();
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash, expiresAt, rememberMe },
  });
  return { accessToken, refreshToken: token, refreshExpiresAt: expiresAt };
}

export async function revokeAllRefreshTokensForUser(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function rotateRefreshToken(presentedToken: string): Promise<{ user: User; tokens: TokenPair; rememberMe: boolean }> {
  const tokenHash = hashToken(presentedToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!stored) {
    throw new InvalidRefreshTokenError();
  }

  if (stored.revokedAt) {
    // Reuse of an already-rotated token is treated as possible theft:
    // invalidate every active session for this user.
    await revokeAllRefreshTokensForUser(stored.userId);
    throw new InvalidRefreshTokenError();
  }

  if (stored.expiresAt < new Date()) {
    throw new InvalidRefreshTokenError();
  }

  if (!stored.user.isActive) {
    await revokeAllRefreshTokensForUser(stored.userId);
    throw new AccountDeactivatedError();
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  // Carries the original login's Remember Me choice forward across every
  // rotation, so a session-only login doesn't silently become persistent
  // (or vice versa) just because a silent refresh happened (Sprint 18).
  const tokens = await issueTokenPair(stored.user, stored.rememberMe);
  return { user: stored.user, tokens, rememberMe: stored.rememberMe };
}

export async function revokeRefreshToken(presentedToken: string): Promise<void> {
  const tokenHash = hashToken(presentedToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}

/**
 * Always resolves regardless of whether the email matches an account —
 * enumeration-prevention, mirroring customers.service.ts's
 * requestPasswordReset (Sprint 18).
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return;
  }
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } });

  const resetLink = `${getStringEnv("FRONTEND_URL", "")}/reset-password?token=${token}`;
  await sendOwnerPasswordResetEmail(user.email, resetLink);
}

/**
 * Confirms a password reset — rejects an unknown/expired/already-used
 * token with one generic error, updates the password, marks the token
 * used, and invalidates every existing session for the account.
 */
export async function resetPassword(presentedToken: string, newPassword: string): Promise<void> {
  const tokenHash = hashToken(presentedToken);
  const stored = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

  if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
    throw new InvalidPasswordResetTokenError();
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: stored.userId }, data: { passwordHash } });
  await prisma.passwordResetToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } });
  await revokeAllRefreshTokensForUser(stored.userId);
}

/** Authenticated password change — re-verifies currentPassword, then invalidates every existing session. */
export async function changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw new InvalidCredentialsError();
  }
  const passwordHash = await hashPassword(input.newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  await revokeAllRefreshTokensForUser(userId);
}

export interface SendEmailVerificationResult {
  sent: boolean;
  errorMessage?: string;
}

/**
 * Issues a fresh single-use email-verification token and emails the link.
 * Never *throws* — a verification-email failure must never block
 * registration/login (Sprint 18 — emailVerified only gates a UI prompt) —
 * but callers that need to know whether the email actually went out (the
 * explicit "Resend email" action) can check the returned result instead
 * of assuming success.
 */
export async function sendEmailVerification(userId: string): Promise<SendEmailVerificationResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.emailVerified) {
    return { sent: true };
  }
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);
  await prisma.emailVerificationToken.create({ data: { userId: user.id, tokenHash, expiresAt } });

  const verifyLink = `${getStringEnv("FRONTEND_URL", "")}/verify-email?token=${token}`;
  const result = await sendEmailVerificationEmail(user.email, verifyLink);
  return { sent: result.success, errorMessage: result.errorMessage };
}

export async function verifyEmail(presentedToken: string): Promise<void> {
  const tokenHash = hashToken(presentedToken);
  const stored = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });

  if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
    throw new InvalidEmailVerificationTokenError();
  }

  await prisma.user.update({ where: { id: stored.userId }, data: { emailVerified: true } });
  await prisma.emailVerificationToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } });
}

export async function updateProfile(userId: string, input: UpdateProfileInput): Promise<User> {
  return prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
    },
  });
}

export { toPublicUser };
