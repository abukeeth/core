import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/prisma", () => ({
  prisma: {
    customer: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    customerRefreshToken: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    customerPasswordResetToken: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("../notifications/notifications.service", () => ({
  sendPasswordResetEmail: vi.fn(),
}));

import { hashPassword } from "../../../lib/password";
import { prisma } from "../../../lib/prisma";
import { sendPasswordResetEmail } from "../notifications/notifications.service";
import {
  CustomerEmailInUseError,
  InvalidCustomerCredentialsError,
  InvalidCustomerRefreshTokenError,
  InvalidPasswordResetTokenError,
} from "./customers.errors";
import {
  changePassword,
  issueCustomerTokenPair,
  registerCustomer,
  requestPasswordReset,
  resetPassword,
  revokeAllCustomerRefreshTokens,
  revokeCustomerRefreshToken,
  rotateCustomerRefreshToken,
  toPublicCustomer,
  validateCustomerCredentials,
} from "./customers.service";

const mockPrisma = vi.mocked(prisma, { deep: true });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.JWT_ACCESS_SECRET = "test-secret-value-not-real";
  process.env.JWT_ACCESS_TTL = "15m";
});

describe("registerCustomer", () => {
  it("rejects a duplicate email", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({ id: "c1", email: "a@b.com" } as never);

    await expect(
      registerCustomer({ email: "a@b.com", password: "password123", name: "Alex" }),
    ).rejects.toBeInstanceOf(CustomerEmailInUseError);
    expect(mockPrisma.customer.create).not.toHaveBeenCalled();
  });

  it("creates a customer with a hashed password", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue(null as never);
    mockPrisma.customer.create.mockResolvedValue({ id: "c1", email: "a@b.com" } as never);

    await registerCustomer({ email: "a@b.com", password: "password123", name: "Alex" });

    const call = mockPrisma.customer.create.mock.calls[0][0];
    expect(call.data.passwordHash).not.toBe("password123");
    expect(typeof call.data.passwordHash).toBe("string");
  });
});

describe("validateCustomerCredentials", () => {
  it("rejects a nonexistent email", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue(null as never);
    await expect(
      validateCustomerCredentials({ email: "nope@b.com", password: "password123" }),
    ).rejects.toBeInstanceOf(InvalidCustomerCredentialsError);
  });

  it("rejects a customer with no password set (guest-only record)", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({ id: "c1", passwordHash: null } as never);
    await expect(
      validateCustomerCredentials({ email: "a@b.com", password: "password123" }),
    ).rejects.toBeInstanceOf(InvalidCustomerCredentialsError);
  });
});

describe("issueCustomerTokenPair (Sprint 07.7 H-7)", () => {
  it("stores the refresh token hashed, never in plaintext, in the database", async () => {
    mockPrisma.customerRefreshToken.create.mockResolvedValue({ id: "crt-1" } as never);

    const pair = await issueCustomerTokenPair("c1");

    const call = mockPrisma.customerRefreshToken.create.mock.calls[0][0];
    expect(call.data.tokenHash).not.toBe(pair.refreshToken);
    expect(typeof call.data.tokenHash).toBe("string");
    expect(call.data.customerId).toBe("c1");
  });
});

describe("rotateCustomerRefreshToken (Sprint 07.7 H-7)", () => {
  it("rejects an unknown token", async () => {
    mockPrisma.customerRefreshToken.findUnique.mockResolvedValue(null as never);
    await expect(rotateCustomerRefreshToken("nope")).rejects.toBeInstanceOf(InvalidCustomerRefreshTokenError);
  });

  it("rejects an expired token", async () => {
    mockPrisma.customerRefreshToken.findUnique.mockResolvedValue({
      id: "crt-1",
      customerId: "c1",
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    } as never);
    await expect(rotateCustomerRefreshToken("stale")).rejects.toBeInstanceOf(InvalidCustomerRefreshTokenError);
  });

  it("rejects an already-revoked token and revokes every other active session for that customer (theft response)", async () => {
    mockPrisma.customerRefreshToken.findUnique.mockResolvedValue({
      id: "crt-1",
      customerId: "c1",
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 100000),
    } as never);

    await expect(rotateCustomerRefreshToken("already-used")).rejects.toBeInstanceOf(InvalidCustomerRefreshTokenError);
    expect(mockPrisma.customerRefreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerId: "c1", revokedAt: null } }),
    );
  });

  it("rotates a valid token: revokes the old row and issues a brand-new pair", async () => {
    mockPrisma.customerRefreshToken.findUnique.mockResolvedValue({
      id: "crt-1",
      customerId: "c1",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 100000),
    } as never);
    mockPrisma.customerRefreshToken.create.mockResolvedValue({ id: "crt-2" } as never);

    const { customerId, tokens } = await rotateCustomerRefreshToken("valid");

    expect(customerId).toBe("c1");
    expect(mockPrisma.customerRefreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "crt-1" }, data: expect.objectContaining({ revokedAt: expect.any(Date) }) }),
    );
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
  });
});

describe("revokeCustomerRefreshToken / revokeAllCustomerRefreshTokens (Sprint 07.7 H-7)", () => {
  it("revokeCustomerRefreshToken revokes only the matching, still-active token by hash", async () => {
    await revokeCustomerRefreshToken("some-token");
    expect(mockPrisma.customerRefreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revokedAt: null }),
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
  });

  it("revokeAllCustomerRefreshTokens invalidates every active token for a customer", async () => {
    await revokeAllCustomerRefreshTokens("c1");
    expect(mockPrisma.customerRefreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerId: "c1", revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
  });
});

describe("requestPasswordReset (Sprint 07.7 H-6)", () => {
  it("resolves successfully (no throw) when the email does not match any account — enumeration prevention", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue(null as never);

    await expect(requestPasswordReset("nope@b.com")).resolves.toBeUndefined();
    expect(mockPrisma.customerPasswordResetToken.create).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("stores a hashed, single-use token and emails a reset link when the email matches", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({ id: "c1", email: "a@b.com" } as never);
    mockPrisma.customerPasswordResetToken.create.mockResolvedValue({ id: "prt-1" } as never);

    await requestPasswordReset("a@b.com");

    const call = mockPrisma.customerPasswordResetToken.create.mock.calls[0][0];
    expect(call.data.customerId).toBe("c1");
    expect(typeof call.data.tokenHash).toBe("string");
    expect(sendPasswordResetEmail).toHaveBeenCalledWith("c1", "a@b.com", expect.stringContaining("token="));
  });
});

describe("resetPassword (Sprint 07.7 H-6)", () => {
  it("rejects an unknown token", async () => {
    mockPrisma.customerPasswordResetToken.findUnique.mockResolvedValue(null as never);
    await expect(resetPassword("nope", "newPassword123")).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);
  });

  it("rejects an expired token", async () => {
    mockPrisma.customerPasswordResetToken.findUnique.mockResolvedValue({
      id: "prt-1",
      customerId: "c1",
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    } as never);
    await expect(resetPassword("stale", "newPassword123")).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);
  });

  it("rejects an already-used token, with the same generic error as expired/unknown", async () => {
    mockPrisma.customerPasswordResetToken.findUnique.mockResolvedValue({
      id: "prt-1",
      customerId: "c1",
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 100000),
    } as never);
    await expect(resetPassword("used", "newPassword123")).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);
  });

  it("updates the password hash, marks the token used, and invalidates existing sessions on success", async () => {
    mockPrisma.customerPasswordResetToken.findUnique.mockResolvedValue({
      id: "prt-1",
      customerId: "c1",
      usedAt: null,
      expiresAt: new Date(Date.now() + 100000),
    } as never);

    await resetPassword("valid", "newPassword123");

    const updateCall = mockPrisma.customer.update.mock.calls[0][0];
    expect(updateCall.where).toEqual({ id: "c1" });
    expect(updateCall.data.passwordHash).not.toBe("newPassword123");
    expect(mockPrisma.customerPasswordResetToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "prt-1" }, data: expect.objectContaining({ usedAt: expect.any(Date) }) }),
    );
    expect(mockPrisma.customerRefreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerId: "c1", revokedAt: null } }),
    );
  });
});

describe("changePassword (Sprint 07.7 H-6)", () => {
  it("rejects an incorrect currentPassword", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({ id: "c1", passwordHash: await hashPassword("correct-password") } as never);
    await expect(changePassword("c1", "wrong-password", "newPassword123")).rejects.toBeInstanceOf(InvalidCustomerCredentialsError);
    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
  });

  it("updates the password and invalidates existing sessions on success", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({ id: "c1", passwordHash: await hashPassword("correct-password") } as never);

    await changePassword("c1", "correct-password", "newPassword123");

    expect(mockPrisma.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c1" }, data: expect.objectContaining({ passwordHash: expect.any(String) }) }),
    );
    expect(mockPrisma.customerRefreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { customerId: "c1", revokedAt: null } }),
    );
  });
});

describe("toPublicCustomer", () => {
  it("strips passwordHash", () => {
    const publicCustomer = toPublicCustomer({
      id: "c1",
      email: "a@b.com",
      name: "Alex",
      phone: null,
      passwordHash: "secret-hash",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);
    expect(publicCustomer).not.toHaveProperty("passwordHash");
  });
});
