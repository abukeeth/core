import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    refreshToken: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    passwordResetToken: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    emailVerificationToken: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../../lib/password", () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("../commerce/notifications/notifications.service", () => ({
  sendOwnerPasswordResetEmail: vi.fn(),
  sendEmailVerificationEmail: vi.fn(),
}));

import { prisma } from "../../lib/prisma";
import { hashPassword, verifyPassword } from "../../lib/password";
import { sendEmailVerificationEmail, sendOwnerPasswordResetEmail } from "../commerce/notifications/notifications.service";
import {
  AccountDeactivatedError,
  InvalidCredentialsError,
  InvalidEmailVerificationTokenError,
  InvalidPasswordResetTokenError,
  StaffNotFoundError,
} from "./auth.errors";
import {
  changePassword,
  listStaff,
  requestPasswordReset,
  resetPassword,
  rotateRefreshToken,
  sendEmailVerification,
  setStaffActive,
  validateCredentials,
  verifyEmail,
} from "./auth.service";

const mockPrisma = vi.mocked(prisma, { deep: true });
const mockVerifyPassword = vi.mocked(verifyPassword);
const mockHashPassword = vi.mocked(hashPassword);
const mockSendOwnerPasswordResetEmail = vi.mocked(sendOwnerPasswordResetEmail);
const mockSendEmailVerificationEmail = vi.mocked(sendEmailVerificationEmail);

beforeEach(() => {
  vi.clearAllMocks();
  mockSendEmailVerificationEmail.mockResolvedValue({ success: true });
  process.env.DATABASE_URL = "postgres://test";
  process.env.FRONTEND_URL = "https://test.example.com";
  process.env.JWT_ACCESS_SECRET = "test-secret-value-not-real";
  process.env.JWT_ACCESS_TTL = "15m";
  process.env.JWT_REFRESH_TTL = "30d";
  process.env.COMMERCE_ENCRYPTION_KEY = "0".repeat(64);
});

describe("validateCredentials", () => {
  it("throws InvalidCredentialsError when the password is wrong", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      passwordHash: "hash",
      isActive: true,
    } as never);
    mockVerifyPassword.mockResolvedValue(false);

    await expect(validateCredentials({ email: "a@b.com", password: "wrong" })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it("throws AccountDeactivatedError for a correct password on a deactivated account", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "u1",
      passwordHash: "hash",
      isActive: false,
    } as never);
    mockVerifyPassword.mockResolvedValue(true);

    await expect(validateCredentials({ email: "a@b.com", password: "correct" })).rejects.toThrow(
      AccountDeactivatedError,
    );
  });

  it("returns the user when the password is correct and the account is active", async () => {
    const user = { id: "u1", passwordHash: "hash", isActive: true };
    mockPrisma.user.findUnique.mockResolvedValue(user as never);
    mockVerifyPassword.mockResolvedValue(true);

    await expect(validateCredentials({ email: "a@b.com", password: "correct" })).resolves.toEqual(user);
  });
});

describe("rotateRefreshToken", () => {
  it("revokes all sessions and throws AccountDeactivatedError when the owning user is deactivated", async () => {
    mockPrisma.refreshToken.findUnique.mockResolvedValue({
      id: "rt1",
      userId: "u1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 100_000),
      user: { id: "u1", isActive: false },
    } as never);

    await expect(rotateRefreshToken("presented-token")).rejects.toThrow(AccountDeactivatedError);
    expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", revokedAt: null } }),
    );
  });

  it("carries the original rememberMe=false choice forward into the newly issued refresh token", async () => {
    mockPrisma.refreshToken.findUnique.mockResolvedValue({
      id: "rt1",
      userId: "u1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 100_000),
      rememberMe: false,
      user: { id: "u1", role: "RESTAURANT_OWNER", isActive: true },
    } as never);
    mockPrisma.refreshToken.create.mockResolvedValue({} as never);

    const { rememberMe } = await rotateRefreshToken("presented-token");

    expect(rememberMe).toBe(false);
    expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rememberMe: false }) }),
    );
  });
});

describe("requestPasswordReset", () => {
  it("resolves without emailing when no account matches", async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await requestPasswordReset("nobody@x.com");

    expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(mockSendOwnerPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("stores a hashed token and emails a reset link when the account exists", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com" } as never);

    await requestPasswordReset("a@b.com");

    expect(mockPrisma.passwordResetToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u1" }) }),
    );
    expect(mockSendOwnerPasswordResetEmail).toHaveBeenCalledWith("a@b.com", expect.stringContaining("/reset-password?token="));
  });
});

describe("resetPassword", () => {
  it("throws InvalidPasswordResetTokenError for an unknown token", async () => {
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue(null);

    await expect(resetPassword("bad-token", "newpassword1")).rejects.toThrow(InvalidPasswordResetTokenError);
  });

  it("throws InvalidPasswordResetTokenError for an already-used token", async () => {
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
      id: "prt1",
      userId: "u1",
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 100_000),
    } as never);

    await expect(resetPassword("used-token", "newpassword1")).rejects.toThrow(InvalidPasswordResetTokenError);
  });

  it("updates the password, marks the token used, and revokes all sessions on success", async () => {
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
      id: "prt1",
      userId: "u1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 100_000),
    } as never);
    mockHashPassword.mockResolvedValue("new-hash");

    await resetPassword("good-token", "newpassword1");

    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { passwordHash: "new-hash" } });
    expect(mockPrisma.passwordResetToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "prt1" } }),
    );
    expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", revokedAt: null } }),
    );
  });
});

describe("changePassword", () => {
  it("throws InvalidCredentialsError when currentPassword is wrong", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", passwordHash: "hash" } as never);
    mockVerifyPassword.mockResolvedValue(false);

    await expect(changePassword("u1", { currentPassword: "wrong", newPassword: "newpassword1" })).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it("updates the password and revokes all sessions on success", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", passwordHash: "hash" } as never);
    mockVerifyPassword.mockResolvedValue(true);
    mockHashPassword.mockResolvedValue("new-hash");

    await changePassword("u1", { currentPassword: "correct", newPassword: "newpassword1" });

    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { passwordHash: "new-hash" } });
    expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", revokedAt: null } }),
    );
  });
});

describe("sendEmailVerification", () => {
  it("does nothing when the account is already verified", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", emailVerified: true } as never);

    await sendEmailVerification("u1");

    expect(mockPrisma.emailVerificationToken.create).not.toHaveBeenCalled();
    expect(mockSendEmailVerificationEmail).not.toHaveBeenCalled();
  });

  it("stores a token and emails a verify link when unverified", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", emailVerified: false } as never);

    const result = await sendEmailVerification("u1");

    expect(mockPrisma.emailVerificationToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u1" }) }),
    );
    expect(mockSendEmailVerificationEmail).toHaveBeenCalledWith("a@b.com", expect.stringContaining("/verify-email?token="));
    expect(result).toEqual({ sent: true, errorMessage: undefined });
  });

  it("reports sent: false with the underlying error when the email actually fails to send (e.g. SMTP misconfigured)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", emailVerified: false } as never);
    mockSendEmailVerificationEmail.mockResolvedValue({ success: false, errorMessage: "SMTP connection refused" });

    const result = await sendEmailVerification("u1");

    expect(result).toEqual({ sent: false, errorMessage: "SMTP connection refused" });
  });
});

describe("verifyEmail", () => {
  it("throws InvalidEmailVerificationTokenError for an unknown/expired token", async () => {
    mockPrisma.emailVerificationToken.findUnique.mockResolvedValue(null);

    await expect(verifyEmail("bad-token")).rejects.toThrow(InvalidEmailVerificationTokenError);
  });

  it("marks the user verified and the token used on success", async () => {
    mockPrisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: "evt1",
      userId: "u1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 100_000),
    } as never);

    await verifyEmail("good-token");

    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { emailVerified: true } });
    expect(mockPrisma.emailVerificationToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "evt1" } }),
    );
  });
});

describe("listStaff", () => {
  it("returns an empty list when the owner has no restaurant", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: null } as never);

    await expect(listStaff("owner1")).resolves.toEqual([]);
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });

  it("lists staff scoped to the owner's restaurant", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: "rest1" } as never);
    const staff = [{ id: "s1", name: "Jo", email: "jo@x.com", phone: null, isActive: true, createdAt: new Date() }];
    mockPrisma.user.findMany.mockResolvedValue(staff as never);

    await expect(listStaff("owner1")).resolves.toEqual(staff);
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ restaurantId: "rest1" }) }),
    );
  });
});

describe("setStaffActive", () => {
  it("throws StaffNotFoundError when the target belongs to a different restaurant", async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ restaurantId: "rest1" } as never)
      .mockResolvedValueOnce({ id: "s1", role: "RESTAURANT_STAFF", restaurantId: "rest2" } as never);

    await expect(setStaffActive("owner1", "s1", false)).rejects.toThrow(StaffNotFoundError);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("throws StaffNotFoundError when the target is the owner themselves (not RESTAURANT_STAFF)", async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ restaurantId: "rest1" } as never)
      .mockResolvedValueOnce({ id: "owner1", role: "RESTAURANT_OWNER", restaurantId: "rest1" } as never);

    await expect(setStaffActive("owner1", "owner1", false)).rejects.toThrow(StaffNotFoundError);
  });

  it("deactivates a valid staff member and revokes all their sessions", async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ restaurantId: "rest1" } as never)
      .mockResolvedValueOnce({ id: "s1", role: "RESTAURANT_STAFF", restaurantId: "rest1" } as never);
    mockPrisma.user.update.mockResolvedValue({
      id: "s1",
      name: "Jo",
      email: "jo@x.com",
      phone: null,
      isActive: false,
      createdAt: new Date(),
    } as never);

    const result = await setStaffActive("owner1", "s1", false);

    expect(result.isActive).toBe(false);
    expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "s1", revokedAt: null } }),
    );
  });

  it("reactivates a staff member without revoking sessions", async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ restaurantId: "rest1" } as never)
      .mockResolvedValueOnce({ id: "s1", role: "RESTAURANT_STAFF", restaurantId: "rest1" } as never);
    mockPrisma.user.update.mockResolvedValue({
      id: "s1",
      name: "Jo",
      email: "jo@x.com",
      phone: null,
      isActive: true,
      createdAt: new Date(),
    } as never);

    await setStaffActive("owner1", "s1", true);

    expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
  });
});
