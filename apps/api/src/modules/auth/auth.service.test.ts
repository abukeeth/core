import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
    membership: { create: vi.fn() },
    refreshToken: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    passwordResetToken: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    emailVerificationToken: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
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
  OwnerWithoutBusinessError,
  StaffNotFoundError,
} from "./auth.errors";
import {
  changePassword,
  createStaff,
  listStaff,
  reassignStaffRole,
  requestPasswordReset,
  resetPassword,
  rotateRefreshToken,
  sendEmailVerification,
  setStaffActive,
  validateCredentials,
  verifyEmail,
} from "./auth.service";
import { createStaffSchema, reassignStaffRoleSchema } from "./auth.validation";

const mockPrisma = vi.mocked(prisma, { deep: true });
const mockVerifyPassword = vi.mocked(verifyPassword);
const mockHashPassword = vi.mocked(hashPassword);
const mockSendOwnerPasswordResetEmail = vi.mocked(sendOwnerPasswordResetEmail);
const mockSendEmailVerificationEmail = vi.mocked(sendEmailVerificationEmail);

beforeEach(() => {
  vi.clearAllMocks();
  mockSendEmailVerificationEmail.mockResolvedValue({ success: true });
  mockSendOwnerPasswordResetEmail.mockResolvedValue({ success: true });
  mockPrisma.emailVerificationToken.findFirst.mockResolvedValue(null as never);
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

    await expect(requestPasswordReset("nobody@x.com")).resolves.toEqual({ accountFound: false, sent: true });

    expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(mockSendOwnerPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("stores a hashed token and emails a reset link when the account exists", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com" } as never);

    await expect(requestPasswordReset("a@b.com")).resolves.toEqual({
      accountFound: true,
      sent: true,
      errorMessage: undefined,
    });

    expect(mockPrisma.passwordResetToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "u1" }) }),
    );
    expect(mockSendOwnerPasswordResetEmail).toHaveBeenCalledWith("a@b.com", expect.stringContaining("/reset-password?token="));
  });

  it("returns sent=false when provider delivery fails", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com" } as never);
    mockSendOwnerPasswordResetEmail.mockResolvedValue({ success: false, errorMessage: "SMTP unavailable" });

    await expect(requestPasswordReset("a@b.com")).resolves.toEqual({
      accountFound: true,
      sent: false,
      errorMessage: "SMTP unavailable",
    });
  });

  it("§19/§20: the reset link never contains a placeholder domain, even if FRONTEND_URL is still misconfigured to one", async () => {
    const original = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = "https://placeholder.example";
    vi.resetModules();
    try {
      const fresh = await import("./auth.service.js");
      mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com" } as never);

      await fresh.requestPasswordReset("a@b.com");

      const [, link] = mockSendOwnerPasswordResetEmail.mock.calls.at(-1)!;
      expect(link).toContain("https://www.ordervora.com/reset-password?token=");
      expect(link).not.toContain("placeholder.example");
    } finally {
      // Assigning `undefined` stringifies to "undefined" instead of
      // deleting the key — would otherwise poison FRONTEND_URL for later
      // test files sharing this worker if it wasn't actually set before.
      if (original === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = original;
      vi.resetModules();
    }
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

    await expect(sendEmailVerification("u1")).resolves.toEqual({ sent: true, state: "ALREADY_VERIFIED" });

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
    expect(result).toEqual({ sent: true, state: "SENT" });
  });

  it("reports sent: false with the underlying error when the email actually fails to send (e.g. SMTP misconfigured)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", emailVerified: false } as never);
    mockSendEmailVerificationEmail.mockResolvedValue({ success: false, errorMessage: "SMTP connection refused" });

    const result = await sendEmailVerification("u1");

    expect(result).toEqual({ sent: false, state: "FAILED", errorMessage: "SMTP connection refused" });
  });

  it("throttles resend requests within cooldown window without creating another token", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", emailVerified: false } as never);
    mockPrisma.emailVerificationToken.findFirst.mockResolvedValue({
      id: "evt1",
      userId: "u1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    } as never);

    await expect(sendEmailVerification("u1", { enforceResendCooldown: true })).resolves.toEqual({
      sent: true,
      state: "THROTTLED",
    });

    expect(mockPrisma.emailVerificationToken.create).not.toHaveBeenCalled();
    expect(mockSendEmailVerificationEmail).not.toHaveBeenCalled();
  });

  it("§19/§20: the verify link never contains a placeholder domain, even if FRONTEND_URL is still misconfigured to one", async () => {
    const original = process.env.FRONTEND_URL;
    process.env.FRONTEND_URL = "https://placeholder.example";
    vi.resetModules();
    try {
      const fresh = await import("./auth.service.js");
      mockPrisma.user.findUnique.mockResolvedValue({ id: "u1", email: "a@b.com", emailVerified: false } as never);

      await fresh.sendEmailVerification("u1");

      const [, link] = mockSendEmailVerificationEmail.mock.calls.at(-1)!;
      expect(link).toContain("https://www.ordervora.com/verify-email?token=");
      expect(link).not.toContain("placeholder.example");
    } finally {
      // Assigning `undefined` stringifies to "undefined" instead of
      // deleting the key — would otherwise poison FRONTEND_URL for later
      // test files sharing this worker if it wasn't actually set before.
      if (original === undefined) delete process.env.FRONTEND_URL;
      else process.env.FRONTEND_URL = original;
      vi.resetModules();
    }
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

describe("createStaff (P2.6.0 — scoped Membership on staff creation)", () => {
  // assertEmailAvailable does user.findUnique({where:{email}}) first (→ null =
  // available), then createStaff does user.findUnique({where:{id},select:...})
  // for the owner's business id.
  function primeLookups(ownerRestaurantId: string | null) {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(null as never) // email available
      .mockResolvedValueOnce({ restaurantId: ownerRestaurantId } as never); // owner's business
    mockHashPassword.mockResolvedValue("hashed" as never);
  }

  function txMock() {
    const userCreate = vi.fn().mockResolvedValue({ id: "staff-1", role: "RESTAURANT_STAFF", restaurantId: "rest-1" });
    const membershipCreate = vi.fn().mockResolvedValue({ id: "mem-1" });
    const tx = { user: { create: userCreate }, membership: { create: membershipCreate } };
    (mockPrisma.$transaction as unknown as { mockImplementation: (fn: (cb: (t: typeof tx) => unknown) => unknown) => void })
      .mockImplementation((fn) => fn(tx));
    return { userCreate, membershipCreate };
  }

  it("creates a RESTAURANT_STAFF user and a STAFF @ BUSINESS membership scoped to the owner's business, in one transaction", async () => {
    primeLookups("rest-1");
    const { userCreate, membershipCreate } = txMock();

    const staff = await createStaff("owner1", { email: "s@x.com", password: "pw", name: "S" });

    expect(staff).toEqual(expect.objectContaining({ id: "staff-1", role: "RESTAURANT_STAFF" }));
    expect(userCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ role: "RESTAURANT_STAFF", invitedById: "owner1", restaurantId: "rest-1" }),
    });
    expect(membershipCreate).toHaveBeenCalledWith({
      data: { userId: "staff-1", role: "STAFF", scopeType: "BUSINESS", scopeId: "rest-1" },
    });
    // Fresh user → exactly one membership (no duplicate).
    expect(membershipCreate).toHaveBeenCalledTimes(1);
  });

  it("scopes the membership to the OWNER's business id (never a cross-business id)", async () => {
    primeLookups("rest-OWNER");
    const { membershipCreate } = txMock();

    await createStaff("owner1", { email: "s@x.com", password: "pw", name: "S" });

    expect(membershipCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ scopeType: "BUSINESS", scopeId: "rest-OWNER" }),
    });
  });

  it("rejects with OwnerWithoutBusinessError when the owner has no business yet", async () => {
    primeLookups(null);
    txMock();

    await expect(createStaff("owner1", { email: "s@x.com", password: "pw", name: "S" })).rejects.toBeInstanceOf(
      OwnerWithoutBusinessError,
    );
  });

  it("creates neither a User nor a Membership when the owner has no business (fails before any write)", async () => {
    primeLookups(null);
    const { userCreate, membershipCreate } = txMock();

    await expect(createStaff("owner1", { email: "s@x.com", password: "pw", name: "S" })).rejects.toBeInstanceOf(
      OwnerWithoutBusinessError,
    );

    // No transaction is opened and no rows are written.
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(userCreate).not.toHaveBeenCalled();
    expect(membershipCreate).not.toHaveBeenCalled();
  });

  it("rolls back the whole transaction if membership creation fails (staff not returned)", async () => {
    primeLookups("rest-1");
    const failure = new Error("membership write failed");
    const userCreate = vi.fn().mockResolvedValue({ id: "staff-1" });
    const membershipCreate = vi.fn().mockRejectedValue(failure);
    const tx = { user: { create: userCreate }, membership: { create: membershipCreate } };
    (mockPrisma.$transaction as unknown as { mockImplementation: (fn: (cb: (t: typeof tx) => unknown) => unknown) => void })
      .mockImplementation((fn) => fn(tx));

    await expect(createStaff("owner1", { email: "s@x.com", password: "pw", name: "S" })).rejects.toThrow(failure);
  });

  it("does not create a membership if user creation fails (transaction aborts first)", async () => {
    primeLookups("rest-1");
    const failure = new Error("user write failed");
    const userCreate = vi.fn().mockRejectedValue(failure);
    const membershipCreate = vi.fn();
    const tx = { user: { create: userCreate }, membership: { create: membershipCreate } };
    (mockPrisma.$transaction as unknown as { mockImplementation: (fn: (cb: (t: typeof tx) => unknown) => unknown) => void })
      .mockImplementation((fn) => fn(tx));

    await expect(createStaff("owner1", { email: "s@x.com", password: "pw", name: "S" })).rejects.toThrow(failure);
    expect(membershipCreate).not.toHaveBeenCalled();
  });
});

describe("createStaff (P2.6.1-pre-a — selectable membership role STAFF|KITCHEN)", () => {
  function primeLookups(ownerRestaurantId: string | null) {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(null as never) // email available
      .mockResolvedValueOnce({ restaurantId: ownerRestaurantId } as never); // owner's business
    mockHashPassword.mockResolvedValue("hashed" as never);
  }

  function txMock() {
    const userCreate = vi.fn().mockResolvedValue({ id: "staff-1", role: "RESTAURANT_STAFF", restaurantId: "rest-1" });
    const membershipCreate = vi.fn().mockResolvedValue({ id: "mem-1" });
    const tx = { user: { create: userCreate }, membership: { create: membershipCreate } };
    (mockPrisma.$transaction as unknown as { mockImplementation: (fn: (cb: (t: typeof tx) => unknown) => unknown) => void })
      .mockImplementation((fn) => fn(tx));
    return { userCreate, membershipCreate };
  }

  it("defaults to a STAFF membership when membershipRole is omitted (backward compatible)", async () => {
    primeLookups("rest-1");
    const { membershipCreate } = txMock();

    await createStaff("owner1", { email: "s@x.com", password: "pw", name: "S" });

    expect(membershipCreate).toHaveBeenCalledWith({
      data: { userId: "staff-1", role: "STAFF", scopeType: "BUSINESS", scopeId: "rest-1" },
    });
    expect(membershipCreate).toHaveBeenCalledTimes(1);
  });

  it("creates a STAFF @ BUSINESS membership when membershipRole is explicitly STAFF", async () => {
    primeLookups("rest-1");
    const { membershipCreate } = txMock();

    await createStaff("owner1", { email: "s@x.com", password: "pw", name: "S", membershipRole: "STAFF" });

    expect(membershipCreate).toHaveBeenCalledWith({
      data: { userId: "staff-1", role: "STAFF", scopeType: "BUSINESS", scopeId: "rest-1" },
    });
    expect(membershipCreate).toHaveBeenCalledTimes(1);
  });

  it("creates a KITCHEN @ BUSINESS membership when membershipRole is KITCHEN", async () => {
    primeLookups("rest-1");
    const { membershipCreate } = txMock();

    await createStaff("owner1", { email: "s@x.com", password: "pw", name: "S", membershipRole: "KITCHEN" });

    expect(membershipCreate).toHaveBeenCalledWith({
      data: { userId: "staff-1", role: "KITCHEN", scopeType: "BUSINESS", scopeId: "rest-1" },
    });
    // Exactly one membership — no duplicate for the freshly created user.
    expect(membershipCreate).toHaveBeenCalledTimes(1);
  });

  it("scopes a KITCHEN membership to the owner's business id (correct BUSINESS scope)", async () => {
    primeLookups("rest-OWNER");
    const { membershipCreate } = txMock();

    await createStaff("owner1", { email: "s@x.com", password: "pw", name: "S", membershipRole: "KITCHEN" });

    expect(membershipCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ role: "KITCHEN", scopeType: "BUSINESS", scopeId: "rest-OWNER" }),
    });
  });

  it("keeps User.role = RESTAURANT_STAFF regardless of the selected membership role", async () => {
    for (const membershipRole of ["STAFF", "KITCHEN"] as const) {
      vi.clearAllMocks();
      primeLookups("rest-1");
      const { userCreate } = txMock();

      await createStaff("owner1", { email: "s@x.com", password: "pw", name: "S", membershipRole });

      expect(userCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ role: "RESTAURANT_STAFF" }),
      });
    }
  });

  it("rejects unsupported membership roles at the validation boundary (schema)", () => {
    for (const role of ["OWNER", "ADMIN", "MANAGER", "MARKETING", "SUPPORT", "kitchen", ""]) {
      const parsed = createStaffSchema.safeParse({ email: "s@x.com", password: "hunter22", name: "S", membershipRole: role });
      expect(parsed.success).toBe(false);
    }
  });

  it("applies the STAFF default through the schema when membershipRole is omitted", () => {
    const parsed = createStaffSchema.safeParse({ email: "s@x.com", password: "hunter22", name: "S" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.membershipRole).toBe("STAFF");
    }
  });
});

describe("reassignStaffRole (P2.6.1-pre-b — STAFF↔KITCHEN reassignment in place)", () => {
  const staffRow = {
    id: "staff-1",
    name: "S",
    email: "s@x.com",
    phone: null,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    role: "RESTAURANT_STAFF",
    restaurantId: "rest-1",
  };

  // The owner lookup runs on prisma.user.findUnique (outside the tx); the staff
  // lookup + all membership work run on the tx object built here.
  function primeOwner(businessId: string | null) {
    mockPrisma.user.findUnique.mockResolvedValue({ restaurantId: businessId } as never);
  }

  function reassignTx(opts: {
    staff?: unknown;
    existing?: Array<{ id: string; role: string }>;
    updateRejects?: Error;
  }) {
    const userFindUnique = vi.fn().mockResolvedValue(opts.staff === undefined ? staffRow : opts.staff);
    const membershipFindMany = vi.fn().mockResolvedValue(opts.existing ?? [{ id: "mem-1", role: "STAFF" }]);
    const membershipCreate = vi.fn().mockResolvedValue({ id: "mem-new" });
    const membershipUpdate = opts.updateRejects
      ? vi.fn().mockRejectedValue(opts.updateRejects)
      : vi.fn().mockResolvedValue({ id: "mem-1" });
    const membershipDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const tx = {
      user: { findUnique: userFindUnique, update: vi.fn() },
      membership: {
        findMany: membershipFindMany,
        create: membershipCreate,
        update: membershipUpdate,
        deleteMany: membershipDeleteMany,
      },
    };
    (mockPrisma.$transaction as unknown as { mockImplementation: (fn: (cb: (t: typeof tx) => unknown) => unknown) => void })
      .mockImplementation((fn) => fn(tx));
    return { tx, ...tx.membership, userUpdate: tx.user.update };
  }

  it("1. reassigns STAFF → KITCHEN, updating the existing membership in place", async () => {
    primeOwner("rest-1");
    const { update, create, deleteMany } = reassignTx({ existing: [{ id: "mem-1", role: "STAFF" }] });

    const result = await reassignStaffRole("owner1", "staff-1", "KITCHEN");

    expect(update).toHaveBeenCalledWith({ where: { id: "mem-1" }, data: { role: "KITCHEN" } });
    expect(create).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({ id: "staff-1", membershipRole: "KITCHEN" }));
  });

  it("2. reassigns KITCHEN → STAFF", async () => {
    primeOwner("rest-1");
    const { update } = reassignTx({ existing: [{ id: "mem-1", role: "KITCHEN" }] });

    const result = await reassignStaffRole("owner1", "staff-1", "STAFF");

    expect(update).toHaveBeenCalledWith({ where: { id: "mem-1" }, data: { role: "STAFF" } });
    expect(result.membershipRole).toBe("STAFF");
  });

  it("3. is idempotent when assigning the current role (no write, single row preserved)", async () => {
    primeOwner("rest-1");
    const { update, create, deleteMany } = reassignTx({ existing: [{ id: "mem-1", role: "KITCHEN" }] });

    const result = await reassignStaffRole("owner1", "staff-1", "KITCHEN");

    // Already KITCHEN and no extras → no update, no create, no delete.
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
    expect(result.membershipRole).toBe("KITCHEN");
  });

  it("4. never touches User.role (no user update is performed)", async () => {
    primeOwner("rest-1");
    const { userUpdate } = reassignTx({ existing: [{ id: "mem-1", role: "STAFF" }] });

    await reassignStaffRole("owner1", "staff-1", "KITCHEN");

    expect(userUpdate).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("5. operates only within the owner's business scope", async () => {
    primeOwner("rest-OWNER");
    const staff = { ...staffRow, restaurantId: "rest-OWNER" };
    const { findMany, update } = reassignTx({ staff, existing: [{ id: "mem-1", role: "STAFF" }] });

    await reassignStaffRole("owner1", "staff-1", "KITCHEN");

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "staff-1", scopeType: "BUSINESS", scopeId: "rest-OWNER" },
      }),
    );
    expect(update).toHaveBeenCalledWith({ where: { id: "mem-1" }, data: { role: "KITCHEN" } });
  });

  it("6. returns StaffNotFoundError for a staff member of a different business (no writes)", async () => {
    primeOwner("rest-1");
    const { findMany, update, create, deleteMany } = reassignTx({ staff: { ...staffRow, restaurantId: "rest-OTHER" } });

    await expect(reassignStaffRole("owner1", "staff-1", "KITCHEN")).rejects.toBeInstanceOf(StaffNotFoundError);
    expect(findMany).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("7. returns StaffNotFoundError when the owner has no business (no writes, no existence leak)", async () => {
    primeOwner(null);
    const { findMany, update, create } = reassignTx({ staff: staffRow });

    await expect(reassignStaffRole("owner1", "staff-1", "KITCHEN")).rejects.toBeInstanceOf(StaffNotFoundError);
    expect(findMany).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("8. rejects unsupported target roles at the validation boundary", () => {
    for (const membershipRole of ["OWNER", "ADMIN", "MANAGER", "MARKETING", "SUPPORT", "kitchen", ""]) {
      expect(reassignStaffRoleSchema.safeParse({ membershipRole }).success).toBe(false);
    }
    // Missing field is also rejected (no default on reassignment).
    expect(reassignStaffRoleSchema.safeParse({}).success).toBe(false);
    // The two supported roles pass.
    expect(reassignStaffRoleSchema.safeParse({ membershipRole: "STAFF" }).success).toBe(true);
    expect(reassignStaffRoleSchema.safeParse({ membershipRole: "KITCHEN" }).success).toBe(true);
  });

  it("9. zero-membership fallback creates exactly one valid membership", async () => {
    primeOwner("rest-1");
    const { create, update, deleteMany } = reassignTx({ existing: [] });

    await reassignStaffRole("owner1", "staff-1", "KITCHEN");

    expect(create).toHaveBeenCalledWith({
      data: { userId: "staff-1", role: "KITCHEN", scopeType: "BUSINESS", scopeId: "rest-1" },
    });
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("10. normalizes multiple memberships to one inside the transaction (deletes extras, keeps earliest)", async () => {
    primeOwner("rest-1");
    const { deleteMany, update, create } = reassignTx({
      existing: [
        { id: "mem-1", role: "STAFF" },
        { id: "mem-2", role: "KITCHEN" },
      ],
    });

    await reassignStaffRole("owner1", "staff-1", "KITCHEN");

    // Extras (all but the earliest) are deleted; the survivor is set to target.
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["mem-2"] } } });
    expect(update).toHaveBeenCalledWith({ where: { id: "mem-1" }, data: { role: "KITCHEN" } });
    expect(create).not.toHaveBeenCalled();
  });

  it("11. rolls back (rejects) when the membership mutation fails", async () => {
    primeOwner("rest-1");
    const failure = new Error("membership update failed");
    reassignTx({ existing: [{ id: "mem-1", role: "STAFF" }], updateRejects: failure });

    await expect(reassignStaffRole("owner1", "staff-1", "KITCHEN")).rejects.toThrow(failure);
  });

  it("12. selects/mutates only BUSINESS-scoped rows for this user+business (other scopes untouched)", async () => {
    primeOwner("rest-1");
    const { findMany, deleteMany } = reassignTx({
      existing: [
        { id: "mem-1", role: "STAFF" },
        { id: "mem-2", role: "STAFF" },
      ],
    });

    await reassignStaffRole("owner1", "staff-1", "KITCHEN");

    // The read is scoped to BUSINESS + this business id only — an ORGANIZATION or
    // other-business membership is never in the working set.
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "staff-1", scopeType: "BUSINESS", scopeId: "rest-1" },
      }),
    );
    // Deletes target only ids returned by that scoped read.
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["mem-2"] } } });
  });

  it("13. leaves no mixed STAFF+KITCHEN state — a single row of the target role survives", async () => {
    primeOwner("rest-1");
    const { deleteMany, update, create } = reassignTx({
      existing: [
        { id: "mem-staff", role: "STAFF" },
        { id: "mem-kitchen", role: "KITCHEN" },
      ],
    });

    const result = await reassignStaffRole("owner1", "staff-1", "STAFF");

    // The KITCHEN duplicate is removed and the survivor is STAFF → one role only.
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["mem-kitchen"] } } });
    // Keep (mem-staff) is already STAFF → no redundant update needed.
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(result.membershipRole).toBe("STAFF");
  });
});
